import React, { useState, ChangeEvent, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ProductData, Platform } from '../types';
import { Button } from './Button';
import { Toast } from './Toast';
import { searchProductInfo, analyzeFileContent } from '../services/geminiService';

// Handle esm.sh export structure (handle default export if present)
const pdfjs = (pdfjsLib as any).default ?? pdfjsLib;

// Set worker for PDF.js
// using cdnjs for the worker script as it serves a classic script compatible with importScripts
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

interface ProductInputProps {
  onSubmit: (data: ProductData) => void;
  isLoading: boolean;
}

export const ProductInput: React.FC<ProductInputProps> = ({ onSubmit, isLoading }) => {
  const [data, setData] = useState<ProductData>({
    name: '',
    description: '',
    targetAudience: '',
    images: [],
    selectedModel: 'flash',
    platform: 'smartstore',
    price: 0,
    discountRate: 0,
    promotionText: ''
  });

  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: value as any }));
  };
  
  const handleNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages: string[] = [];
      const fileList = Array.from(files).slice(0, 5) as File[]; 
      
      let processed = 0;
      fileList.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            newImages.push(reader.result);
          }
          processed++;
          if (processed === fileList.length) {
            setData(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  // 드래그 앤 드롭 핸들러들
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/')
      );
      
      if (imageFiles.length === 0) {
        setToast({ message: '이미지 파일만 업로드 가능합니다.', type: 'error' });
        return;
      }
      
      // 기존 handleImageChange 로직 재사용
      const newImages: string[] = [];
      const fileList = imageFiles.slice(0, 5) as File[];
      let processed = 0;
      
      fileList.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            newImages.push(reader.result);
          }
          processed++;
          if (processed === fileList.length) {
            setData(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSearch = async () => {
    if (!data.name.trim()) {
      setToast({ message: '제품명을 입력해주세요.', type: 'error' });
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchProductInfo(data.name);
      if (!result.description && !result.targetAudience) {
          throw new Error("검색 결과가 없습니다.");
      }
      setData(prev => ({
        ...prev,
        description: result.description || prev.description,
        targetAudience: result.targetAudience || prev.targetAudience
      }));
      setToast({ message: '제품 정보를 가져왔습니다!', type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ message: '정보를 찾지 못했습니다. 직접 입력해주세요.', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingFile(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        // Use document loading task to better handle worker errors if they occur
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + ' ';
        }
        text = fullText;
      } else {
        // Text or Markdown
        text = await file.text();
      }
      
      if (!text.trim()) {
         setToast({ message: '파일에서 텍스트를 추출할 수 없습니다. 내용이 있는 파일을 업로드해주세요.', type: 'error' });
         return;
      }

      const analysis = await analyzeFileContent(text);
      setData(prev => ({
        ...prev,
        description: analysis.description || prev.description,
        targetAudience: analysis.targetAudience || prev.targetAudience
      }));
      
      setToast({ message: '파일 분석이 완료되었습니다!', type: 'success' });
    } catch (error) {
      console.error("File analysis failed", error);
      setToast({ message: '파일 분석 중 오류가 발생했습니다. (PDF, TXT, MD 파일만 지원됩니다)', type: 'error' });
    } finally {
      setIsAnalyzingFile(false);
      e.target.value = ''; // Reset input so the same file can be selected again
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.images.length > 0) {
      onSubmit(data);
    }
  };

  const handleModelChange = (model: 'flash' | 'pro') => {
    setData(prev => ({...prev, selectedModel: model}));
  };

  const handlePlatformChange = (platform: Platform) => {
    setData(prev => ({...prev, platform}));
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleAutoSearch = () => {
    handleSearch();
  };

  const handleGenerate = (e: React.FormEvent) => {
    handleSubmit(e);
  };

  const canGenerate = data.images.length > 0 && data.name.trim().length > 0;

  return (
    <div className="max-w-5xl mx-auto">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Model Selection */}
          <div className="mb-6">
            <label className="block text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span>🤖</span> AI 모델 선택
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleModelChange('flash')}
                className={`relative p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-xl ${
                  data.selectedModel === 'flash'
                    ? 'border-purple-500 bg-purple-50 shadow-lg shadow-purple-100'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="text-2xl mb-2">⚡</div>
                <div className="font-bold text-slate-800">Nano Banana</div>
                <div className="text-sm text-slate-500 mt-1">빠른 생성 · 경제적</div>
                {data.selectedModel === 'flash' && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleModelChange('pro')}
                className={`relative p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-xl ${
                  data.selectedModel === 'pro'
                    ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  추천
                </div>
                <div className="text-2xl mb-2">✨</div>
                <div className="font-bold text-slate-800">Nano Banana Pro</div>
                <div className="text-sm text-slate-500 mt-1">고화질 · 정교한 결과</div>
                {data.selectedModel === 'pro' && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Platform Selection */}
          <div className="mb-6">
            <label className="block text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span>🛒</span> 판매 플랫폼
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* 스마트스토어 - 왼쪽 (첫 번째) */}
              <button
                type="button"
                onClick={() => handlePlatformChange('smartstore')}
                className={`p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-lg text-left ${
                  data.platform === 'smartstore'
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-slate-800">🛍️ 스마트스토어</div>
                <div className="text-sm text-slate-500 mt-1">9+ 장면 자동 생성</div>
              </button>
              {/* 쿠팡 - 오른쪽 (두 번째) */}
              <button
                type="button"
                onClick={() => handlePlatformChange('coupang')}
                className={`p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-lg text-left ${
                  data.platform === 'coupang'
                    ? 'border-red-500 bg-red-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-slate-800">🚀 쿠팡</div>
                <div className="text-sm text-slate-500 mt-1">12+ 장면 자동 생성</div>
              </button>
            </div>
          </div>

          {/* Price & Discount */}
          <div className="grid grid-cols-2 gap-4 mb-6">
             <div>
                <label htmlFor="price" className="block text-base font-semibold text-slate-700 mb-2">판매가 (원)</label>
                <input
                  type="number"
                  name="price"
                  id="price"
                  className="w-full px-4 py-4 text-lg border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                  placeholder="32900"
                  value={data.price || ''}
                  onChange={handleNumberChange}
                />
             </div>
             <div>
                <label htmlFor="discountRate" className="block text-base font-semibold text-slate-700 mb-2">할인율 (%)</label>
                <input
                  type="number"
                  name="discountRate"
                  id="discountRate"
                  className="w-full px-4 py-4 text-lg border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                  placeholder="25"
                  value={data.discountRate || ''}
                  onChange={handleNumberChange}
                />
             </div>
          </div>

          {/* Product Images */}
          <div className="mb-6">
            <label className="block text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span>📸</span> 제품 사진
              <span className="text-sm font-normal text-slate-400">(여러 장 선택 가능)</span>
            </label>
            <div 
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-lg ${
                isDragging 
                  ? 'border-purple-500 bg-purple-100 scale-[1.02]' 
                  : 'border-slate-300 hover:border-purple-400 hover:bg-purple-50/50'
              }`}
              onClick={handleImageUpload}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                multiple 
                accept="image/*" 
                onChange={handleImageChange} 
              />
              <input 
                type="file" 
                ref={cameraInputRef}
                className="hidden" 
                accept="image/*" 
                capture="environment"
                onChange={handleImageChange} 
              />
              {data.images.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {data.images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square">
                      <img src={img} alt={`Upload ${idx}`} className="w-full h-full object-cover rounded-lg border border-slate-200" />
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg hover:border-purple-400 hover:bg-purple-50/50 transition-all aspect-square">
                    <span className="text-2xl text-slate-400">+</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-3">🖼️</div>
                  {isDragging ? (
                    <p className="text-slate-600 font-medium text-base">여기에 놓으세요!</p>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cameraInputRef.current?.click();
                          }}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2 hover:bg-blue-600 transition-all"
                        >
                          📷 사진 촬영
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="px-4 py-2 bg-gray-500 text-white rounded-lg flex items-center gap-2 hover:bg-gray-600 transition-all"
                        >
                          📁 파일 선택
                        </button>
                      </div>
                      <p className="text-sm text-slate-400">또는 이미지를 여기에 드래그하세요</p>
                      <p className="text-purple-500 text-xs mt-1">💡 깨끗한 흰색 배경 이미지가 가장 좋아요</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Product Name */}
          <div className="mb-6">
            <label className="block text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span>📦</span> 제품명
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                name="name"
                id="name"
                required
                placeholder="예: 프리미엄 무선 이어폰, 유기농 그린티 세트"
                className="flex-1 px-4 py-4 text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                value={data.name}
                onChange={handleTextChange}
              />
              <button 
                type="button" 
                onClick={handleAutoSearch}
                disabled={isSearching || !data.name.trim()}
                className="px-5 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-bold hover:opacity-90 transition-all duration-300 hover:scale-105 hover:shadow-lg flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>🔍</span>
                )}
                자동검색
              </button>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              제품명 입력 후 자동검색하면 설명과 타겟이 자동으로 채워집니다
            </p>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-base font-semibold text-slate-700 mb-2">제품 정보 파일 업로드 (PDF, TXT, MD)</label>
            <div className="relative">
              <input 
                type="file" 
                accept=".pdf,.txt,.md"
                onChange={handleFileUpload}
                className="w-full px-4 py-4 text-base border border-slate-300 rounded-xl file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-base file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
                disabled={isAnalyzingFile}
              />
              {isAnalyzingFile && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center text-purple-600 text-base">
                  <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  파일 분석 중...
                </div>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-2">파일을 업로드하면 내용을 자동으로 분석하여 설명과 타겟을 채워줍니다.</p>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label htmlFor="description" className="block text-base font-semibold text-slate-700 mb-2">제품 설명</label>
            <textarea
              name="description"
              id="description"
              rows={4}
              required
              className="w-full px-4 py-4 text-base border border-slate-300 rounded-xl placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all resize-none"
              placeholder="제품의 특징, 소재, 장점 등을 적거나 '자동검색' 또는 '파일업로드'를 이용하세요."
              value={data.description}
              onChange={handleTextChange}
            />
          </div>

          {/* Target Audience */}
          <div className="mb-6">
            <label htmlFor="targetAudience" className="block text-base font-semibold text-slate-700 mb-2">타겟 고객 / 분위기 (선택)</label>
            <input
              type="text"
              name="targetAudience"
              id="targetAudience"
              className="w-full px-4 py-4 text-base border border-slate-300 rounded-xl placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
              placeholder="예: 20대 대학생, 미니멀리즘"
              value={data.targetAudience}
              onChange={handleTextChange}
            />
          </div>

          {/* Promotion */}
          <div className="mb-6">
            <label htmlFor="promotionText" className="block text-base font-semibold text-slate-700 mb-2">이벤트/프로모션 (선택)</label>
            <input
              type="text"
              name="promotionText"
              id="promotionText"
              className="w-full px-4 py-4 text-base border border-slate-300 rounded-xl placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
              placeholder="예: 여름맞이 1+1 행사, 런칭 기념 30% 할인"
              value={data.promotionText || ''}
              onChange={handleTextChange}
            />
            <p className="text-sm text-slate-400 mt-2">입력 시 상세페이지 최상단에 이벤트 배너 장면이 추가됩니다.</p>
          </div>

          {/* Generate Button */}
          <button
            type="submit"
            onClick={handleGenerate}
            disabled={isLoading || !canGenerate}
            className="w-full py-5 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 text-white rounded-2xl font-bold text-xl shadow-lg shadow-purple-200 hover:shadow-2xl hover:shadow-purple-300 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0 flex items-center justify-center gap-3"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                생성 중...
              </>
            ) : (
              <>
                <span>🚀</span> 상세페이지 생성하기
              </>
            )}
          </button>

          {/* Checklist */}
          <div className="mt-6 p-5 bg-slate-50 rounded-xl transition-all duration-300 hover:bg-slate-100 hover:shadow-md">
            <div className="flex items-center gap-2 mb-3">
              <span>✅</span>
              <span className="font-semibold text-base text-slate-700">자동 적용 사항</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-base">
              <div className="flex items-center gap-2 text-slate-600 transition-all duration-200 hover:text-purple-600 hover:translate-x-1">
                <span className="text-green-500">✓</span> 플랫폼 규정 자동 준수
              </div>
              <div className="flex items-center gap-2 text-slate-600 transition-all duration-200 hover:text-purple-600 hover:translate-x-1">
                <span className="text-green-500">✓</span> 1000px 정방형 이미지
              </div>
              <div className="flex items-center gap-2 text-slate-600 transition-all duration-200 hover:text-purple-600 hover:translate-x-1">
                <span className="text-green-500">✓</span> 모바일 최적화 디자인
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};