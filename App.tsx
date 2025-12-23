import React, { useState, useEffect } from 'react';
import { ProductInput } from './components/ProductInput';
import { DetailPagePreview } from './components/DetailPagePreview';
import { SettingsModal, getStoredApiKey } from './components/SettingsModal';
import { AppState, ProductData, GeneratedCopy, HistoryItem } from './types';
import { generateMarketingCopy, generateVariedScenes, generateSingleScene } from './services/geminiService';

const App: React.FC = () => {
  // Key Management State
  const [isKeyReady, setIsKeyReady] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Undo/Redo를 위한 상태 히스토리
  const [stateHistory, setStateHistory] = useState<AppState[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [isUndoRedoAction, setIsUndoRedoAction] = useState(false);

  // App Logic State
  const [state, setState] = useState<AppState>({
    step: 'input',
    productData: { 
      name: '', 
      description: '', 
      targetAudience: '', 
      images: [], 
      selectedModel: 'flash',
      platform: 'coupang',
      price: 0,
      discountRate: 0,
      promotionText: ''
    },
    originalImages: [],
    generatedImages: [],
    mainImageIndex: 0,
    generatedCopy: null,
    isEditingImage: false
  });

  // Check API Key on Mount
  useEffect(() => {
    const checkKey = () => {
      // Check localStorage first (user input)
      const storedKey = getStoredApiKey();
      if (storedKey) {
        setIsKeyReady(true);
        setIsCheckingKey(false);
        return;
      }
      
      // Check environment variable (development)
      const envKey = (import.meta as any).env?.VITE_NANO_BANANA_API_KEY;
      if (envKey) {
        setIsKeyReady(true);
        setIsCheckingKey(false);
        return;
      }
      
      // Legacy check for aistudio environment
      try {
        const win = window as any;
        if (win.aistudio) {
          win.aistudio.hasSelectedApiKey().then((hasKey: boolean) => {
            setIsKeyReady(hasKey);
            setIsCheckingKey(false);
          });
        } else {
          setIsKeyReady(false);
          setIsCheckingKey(false);
        }
      } catch (e) {
        console.error("API Key check failed:", e);
        setIsKeyReady(false);
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  // 로딩 타이머
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (state.step === 'processing') {
      setElapsedTime(0); // 시작 시 초기화
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0); // 로딩 끝나면 초기화
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.step]);

  // 히스토리 로드 (앱 시작 시)
  useEffect(() => {
    const savedHistory = localStorage.getItem('detailpage_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('히스토리 로드 실패:', e);
      }
    }
  }, []);

  // 히스토리 저장 (변경 시) - 용량 초과 방지
  useEffect(() => {
    if (history.length > 0) {
      try {
        // 이미지 URL만 저장 (Base64 제외하여 용량 절약)
        const compactHistory = history.map(item => ({
          ...item,
          generatedImages: item.generatedImages.map(img => ({
            ...img,
            url: img.url.startsWith('data:') ? '' : img.url // Base64는 저장 안함
          })).filter(img => img.url), // 빈 URL 제거
          thumbnail: item.thumbnail?.startsWith('data:') ? '' : item.thumbnail
        }));
        
        localStorage.setItem('detailpage_history', JSON.stringify(compactHistory));
      } catch (e) {
        console.error('히스토리 저장 실패 (용량 초과):', e);
        // 용량 초과 시 오래된 항목 삭제 후 재시도
        if (history.length > 1) {
          setHistory(prev => prev.slice(0, Math.max(1, prev.length - 1)));
        }
      }
    }
  }, [history]);

  // 공유 링크에서 데이터 로드 (앱 시작 시)
  useEffect(() => {
    loadFromShareLink();
  }, []);

  // 자동저장: state가 변경될 때마다 히스토리에 저장 (preview 단계에서만)
  useEffect(() => {
    // Undo/Redo 액션으로 인한 변경은 히스토리에 추가하지 않음
    if (isUndoRedoAction) {
      setIsUndoRedoAction(false);
      return;
    }
    
    // preview 단계이고 이미지가 있을 때만 히스토리에 추가
    if (state.step === 'preview' && state.generatedImages.length > 0) {
      setStateHistory(prev => {
        // 현재 인덱스 이후의 히스토리는 삭제 (새 분기점)
        const newHistory = prev.slice(0, currentHistoryIndex + 1);
        // 새 상태 추가 (최대 50개 유지)
        const updated = [...newHistory, { ...state }].slice(-50);
        return updated;
      });
      setCurrentHistoryIndex(prev => Math.min(prev + 1, 49));
    }
  }, [state.generatedImages, state.generatedCopy]);

  const handleSelectKey = () => {
    setShowSettings(true);
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    // Check if key was saved
    const storedKey = getStoredApiKey();
    if (storedKey) {
      setIsKeyReady(true);
    }
  };

  const handleInputSubmit = async (data: ProductData) => {
    setState(prev => ({ 
      ...prev, 
      step: 'processing', 
      productData: data, 
      originalImages: data.images, 
      generatedImages: [], // Clear previous
      mainImageIndex: 0
    }));
    
    try {
      // Execute in parallel: Marketing Copy + Additional Scenes
      const [copy, newScenes] = await Promise.all([
        generateMarketingCopy(data),
        generateVariedScenes(data)
      ]);

      // DO NOT include original low-quality images.
      // Use ONLY the AI generated high-quality scenes.
      const allImages = [...newScenes];

      setState(prev => ({ 
        ...prev, 
        step: 'preview', 
        generatedCopy: copy,
        generatedImages: allImages
      }));
    } catch (error: any) {
      console.error("Error generating content:", error);
      
      // 크레딧 부족 에러 처리
      if (error.message?.includes("CREDITS_INSUFFICIENT") || 
          error.message?.toLowerCase().includes("insufficient") || 
          error.message?.toLowerCase().includes("credits")) {
        alert("⚠️ Nano Banana API 크레딧이 부족합니다!\n\nkie.ai에서 크레딧을 충전해주세요.\n\n👉 https://kie.ai/pricing");
        setState(prev => ({ ...prev, step: 'input' }));
        return;
      }
      
      // 기타 에러
      alert("컨텐츠 생성 중 오류가 발생했습니다. API 키가 설정되어 있는지 확인해주세요.\n\n" + (error.message || ""));
      setState(prev => ({ ...prev, step: 'input' }));
    }
  };

  const handleImageUpdate = (newImageUrl: string, index: number) => {
    setState(prev => {
      const updatedImages = [...prev.generatedImages];
      // Keep previous prompt, just update URL
      updatedImages[index] = { ...updatedImages[index], url: newImageUrl };
      return { ...prev, generatedImages: updatedImages };
    });
  };

  const handleImageReorder = (fromIndex: number, toIndex: number) => {
    setState(prev => {
      const newImages = [...prev.generatedImages];
      const [movedImage] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedImage);
      
      // mainImageIndex도 업데이트
      let newMainIndex = prev.mainImageIndex;
      if (fromIndex === prev.mainImageIndex) {
        newMainIndex = toIndex;
      } else if (fromIndex < prev.mainImageIndex && toIndex >= prev.mainImageIndex) {
        newMainIndex = prev.mainImageIndex - 1;
      } else if (fromIndex > prev.mainImageIndex && toIndex <= prev.mainImageIndex) {
        newMainIndex = prev.mainImageIndex + 1;
      }
      
      return {
        ...prev,
        generatedImages: newImages,
        mainImageIndex: newMainIndex
      };
    });
  };

  const handleRegenerateImage = async (index: number, prompt: string) => {
    try {
      // 로딩 상태 설정
      setState(prev => ({ ...prev, isEditingImage: true }));
      
      // 모델명 결정: pro면 nano-banana-pro, 아니면 nano-banana-edit
      const modelName = state.productData.selectedModel === 'pro' ? 'nano-banana-pro' : 'nano-banana-edit';
      
      // 참고 이미지(원본 제품 이미지) 포함하여 재생성
      const referenceImages = state.productData.images || [];
      const newImageUrl = await generateSingleScene(modelName, referenceImages, prompt);
      
      // 이미지 업데이트
      setState(prev => {
        const updatedImages = [...prev.generatedImages];
        updatedImages[index] = { ...updatedImages[index], url: newImageUrl, prompt };
        return { ...prev, generatedImages: updatedImages, isEditingImage: false };
      });
    } catch (error) {
      console.error('이미지 재생성 실패:', error);
      setState(prev => ({ ...prev, isEditingImage: false }));
      alert('이미지 재생성에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleCopyUpdate = (sectionKey: keyof GeneratedCopy, newData: any) => {
    setState(prev => ({
      ...prev,
      generatedCopy: prev.generatedCopy ? { ...prev.generatedCopy, [sectionKey]: newData } : null
    }));
  };

  // Undo 함수
  const handleUndo = () => {
    if (currentHistoryIndex > 0) {
      setIsUndoRedoAction(true);
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      setState(stateHistory[newIndex]);
    }
  };

  // Redo 함수
  const handleRedo = () => {
    if (currentHistoryIndex < stateHistory.length - 1) {
      setIsUndoRedoAction(true);
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      setState(stateHistory[newIndex]);
    }
  };

  const handleMainImageSelect = (index: number) => {
    setState(prev => ({ ...prev, mainImageIndex: index }));
  };

  // 히스토리에 저장
  const saveToHistory = () => {
    if (!state.generatedCopy || state.generatedImages.length === 0) return;
    
    // 외부 URL만 저장 (Base64 이미지 제외)
    const filteredImages = state.generatedImages.filter(img => 
      img.url && !img.url.startsWith('data:')
    );
    
    if (filteredImages.length === 0) {
      alert('저장 가능한 이미지가 없습니다. (외부 URL 이미지만 저장 가능)');
      return;
    }
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      productName: state.productData.name || '제목 없음',
      productData: {
        ...state.productData,
        images: [] // 원본 이미지(Base64)는 저장하지 않음
      },
      generatedImages: filteredImages,
      generatedCopy: state.generatedCopy,
      thumbnail: filteredImages[0]?.url || '',
      originalImages: state.productData.images.filter(url => !url.startsWith('data:'))  // 외부 URL만 저장
    };
    
    setHistory(prev => [newItem, ...prev].slice(0, 200)); // 최대 200개 저장, 초과 시 오래된 항목 자동 삭제
    alert('히스토리에 저장되었습니다!');
  };

  // 히스토리에서 불러오기
  const loadFromHistory = (item: HistoryItem) => {
    setState({
      step: 'preview',
      productData: {
        ...item.productData,
        images: item.originalImages || item.productData.images || []  // 참고 이미지 복원
      },
      originalImages: item.originalImages || [],
      generatedImages: item.generatedImages,
      mainImageIndex: 0,
      generatedCopy: item.generatedCopy,
      isEditingImage: false
    });
    setShowHistory(false);
  };

  // 히스토리 삭제
  const deleteFromHistory = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  // 공유 링크 생성
  const generateShareLink = async () => {
    try {
      // 공유용 데이터 - 이미지 URL만 포함 (Base64 제외)
      const shareData = {
        productData: state.productData,
        copy: state.generatedCopy,
        // 외부 URL만 저장 (data: URL 제외)
        images: state.generatedImages
          .filter(img => !img.url.startsWith('data:'))
          .slice(0, 4) // 최대 4개만
          .map(img => img.url),
        mainImageIndex: state.mainImageIndex,
        originalImages: state.productData.images.filter(url => !url.startsWith('data:'))  // 참고 이미지 추가
      };
      
      const jsonString = JSON.stringify(shareData);
      
      // 데이터가 너무 크면 경고
      if (jsonString.length > 5000) {
        alert('공유 데이터가 너무 큽니다. 일부 이미지가 제외될 수 있습니다.');
      }
      
      const encoded = btoa(unescape(encodeURIComponent(jsonString)));
      const shareUrl = `${window.location.origin}?share=${encoded}`;
      
      await navigator.clipboard.writeText(shareUrl);
      alert('공유 링크가 클립보드에 복사되었습니다!');
    } catch (error) {
      console.error('공유 링크 생성 실패:', error);
      alert('공유 링크 생성에 실패했습니다.');
    }
  };

  // 공유 링크에서 데이터 로드
  const loadFromShareLink = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get('share');
    
    if (shareParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(shareParam)));
        
        // 공유 데이터로 프리뷰 모드 설정
        setState({
          step: 'preview',
          productData: {
            ...decoded.productData,
            images: decoded.originalImages || decoded.productData?.images || []  // 참고 이미지 복원
          },
          originalImages: decoded.originalImages || [],
          generatedImages: decoded.images.map((url: string) => ({
            url,
            prompt: ''
          })),
          generatedCopy: decoded.copy,
          mainImageIndex: decoded.mainImageIndex || 0,
          isEditingImage: false
        });
        
        // URL에서 share 파라미터 제거
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('공유 링크 로드 실패:', error);
      }
    }
  };

  const handleReset = () => {
    // Reset all state to initial values immediately
    setState({
      step: 'input',
      productData: { 
        name: '', 
        description: '', 
        targetAudience: '', 
        images: [], 
        selectedModel: 'flash',
        platform: 'coupang',
        price: 0,
        discountRate: 0,
        promotionText: ''
      },
      originalImages: [],
      generatedImages: [],
      mainImageIndex: 0,
      generatedCopy: null,
      isEditingImage: false
    });
  };

  // 1. Loading State (Checking Key)
  if (isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  // 2. Key Selection Screen
  if (!isKeyReady) {
    return (
      <>
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-lg w-full border border-slate-100 text-center">
             <div className="text-6xl mb-6">🛍️</div>
             <h1 className="text-3xl font-bold text-slate-900 mb-2">AI 상세페이지 제작</h1>
             <p className="text-slate-500 mb-8 text-lg">
               전문가급 쇼핑몰 상세페이지, <br/>
               지금 바로 시작해보세요.
             </p>
             
             <div className="space-y-4">
               <button 
                 onClick={handleSelectKey}
                 className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
               >
                 <span>🔑</span>
                 Nano Banana API Key 연결하기
               </button>
               
               <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-5 text-left mb-4">
                 <div className="flex items-center gap-2 mb-3">
                   <span className="text-2xl">🎁</span>
                   <strong className="text-green-700 text-lg">신규 가입 혜택!</strong>
                 </div>
                 <p className="text-green-800 mb-2">
                   kie.ai 첫 가입 시 <strong className="text-green-900">80 크레딧 무료 제공!</strong>
                 </p>
                 <ul className="text-green-700 text-sm space-y-1 mb-3">
                   <li>• 이미지 1장 = 4 크레딧 ($0.02)</li>
                   <li>• <strong>무료로 이미지 20장 생성 가능</strong></li>
                   <li>• <strong>상세페이지 약 1~2건 무료 제작!</strong></li>
                 </ul>
               </div>
               
               <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-sm text-slate-600 mb-4">
                 <strong>안내:</strong> AI 상세페이지 제작은 Nano Banana AI 모델을 사용하여 고화질 이미지를 생성합니다. 
                 이미지 생성을 위해 kie.ai에서 발급받은 API Key가 필요합니다.<br/><br/>
                 <strong>요금 안내:</strong><br/>
                 • 이미지 1장당 약 $0.02 (약 27원)<br/>
                 • 상세페이지 1건 (12장): 약 $0.24 (약 320원)
               </div>
               
               <a 
                 href="https://kie.ai/api-key" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="inline-block text-xs text-blue-500 hover:text-blue-600 underline font-medium"
               >
                 kie.ai에서 API Key 발급받기 &rarr;
               </a>
             </div>
          </div>
        </div>
        <SettingsModal 
          isOpen={showSettings} 
          onClose={handleSettingsClose} 
        />
      </>
    );
  }

  // 3. Main App UI
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛍️</span>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              AI 상세페이지 제작
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
             {state.step === 'input' && (
               <>
                 <button
                   onClick={() => setShowHistory(true)}
                   className="flex items-center gap-2 px-4 py-2 bg-white shadow-lg hover:shadow-xl rounded-xl text-slate-600 border border-slate-200 transition-all duration-300 hover:scale-105"
                 >
                   <span>📋</span>
                   <span className="text-sm font-medium">히스토리 ({history.length})</span>
                 </button>
                 <button
                   onClick={() => setShowSettings(true)}
                   className="flex items-center gap-2 px-4 py-2 bg-white shadow-lg hover:shadow-xl rounded-xl text-slate-600 border border-slate-200 transition-all duration-300 hover:scale-105"
                 >
                   <span>⚙️</span>
                   <span className="text-sm font-medium">API 설정</span>
                 </button>
               </>
             )}
             {state.step === 'preview' && (
               <div className="flex items-center gap-4 hidden md:flex">
                 <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-mono">
                   Model: {state.productData.selectedModel === 'pro' ? 'Nano Banana Pro' : 'Nano Banana'}
                 </span>
                 <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold uppercase">
                   {state.productData.platform}
                 </span>
                 <div className="text-sm font-medium text-slate-500">
                    {state.productData.name}
                 </div>
               </div>
             )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-8">
        {state.step === 'input' && (
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
                <span>✨</span> AI가 만드는 프로페셔널 상세페이지
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
                단 몇 분 만에,<br/>
                <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  판매를 높이는 상세페이지
                </span>
              </h1>
              <p className="text-slate-500 text-lg max-w-xl mx-auto">
                사진 한 장과 제품명만 입력하세요.<br/>
                쿠팡, 스마트스토어 규정에 맞는 전문가급 페이지가 자동으로 완성됩니다.
              </p>
            </div>
            <ProductInput onSubmit={handleInputSubmit} isLoading={false} />
          </div>
        )}

        {state.step === 'processing' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            
            {/* 타이머 표시 */}
            <div className="text-4xl font-bold text-blue-600 mb-4 font-mono">
              {Math.floor(elapsedTime / 60).toString().padStart(2, '0')}:{(elapsedTime % 60).toString().padStart(2, '0')}
            </div>
            
            <h3 className="text-2xl font-bold text-slate-800 mb-2">AI가 상세페이지를 디자인 중입니다</h3>
            <p className="text-slate-500 mb-2 font-medium text-blue-600">
              {state.productData.platform === 'coupang' ? '쿠팡' : '스마트스토어'} 맞춤 디자인 적용 중...
            </p>
            <p className="text-slate-400 text-sm">레퍼런스 스타일을 분석하여 고화질 이미지를 생성합니다.</p>
          </div>
        )}

        {state.step === 'preview' && state.generatedCopy && state.generatedImages.length > 0 && (
          <>
            {/* 히스토리 저장 버튼 */}
            <div className="flex justify-end gap-2 mb-4">
              <button
                onClick={saveToHistory}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-purple-700 transition-all flex items-center gap-2"
              >
                💾 히스토리에 저장
              </button>
              <button
                onClick={generateShareLink}
                className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-green-700 transition-all flex items-center gap-2"
              >
                🔗 공유 링크 복사
              </button>
            </div>
            
            <DetailPagePreview 
              images={state.generatedImages}
              mainImageIndex={state.mainImageIndex}
              copy={state.generatedCopy}
              productData={state.productData}
              onImageUpdate={handleImageUpdate}
              onMainImageSelect={handleMainImageSelect}
              onReset={handleReset}
              onCopyUpdate={handleCopyUpdate}
              onRegenerateImage={handleRegenerateImage}
              originalImages={state.productData.images}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={currentHistoryIndex > 0}
              canRedo={currentHistoryIndex < stateHistory.length - 1}
              onImageReorder={handleImageReorder}
            />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-center items-center gap-4">
          <div className="text-slate-400 text-sm text-center">
            Powered by Nano Banana AI
          </div>
        </div>
      </footer>
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">📋 히스토리</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <p className="text-4xl mb-4">📭</p>
                  <p>저장된 히스토리가 없습니다.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {history.map(item => (
                    <div 
                      key={item.id} 
                      className="border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="aspect-video bg-slate-100 relative">
                        {item.thumbnail ? (
                          <img 
                            src={item.thumbnail} 
                            alt={item.productName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            🖼️
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-bold text-slate-800 truncate">{item.productName}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(item.timestamp).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          이미지 {item.generatedImages.length}장
                        </p>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => loadFromHistory(item)}
                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                          >
                            불러오기
                          </button>
                          <button
                            onClick={() => deleteFromHistory(item.id)}
                            className="bg-red-100 text-red-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;