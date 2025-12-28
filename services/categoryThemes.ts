// 카테고리별 테마 정의
export interface CategoryTheme {
  name: string;
  // 기본 색상
  primaryColor: string;      // 주요 강조색
  secondaryColor: string;    // 보조색
  backgroundColor: string;   // 배경색
  textColor: string;         // 기본 텍스트색
  accentColor: string;       // 포인트색
  
  // 그라디언트
  gradientFrom: string;
  gradientTo: string;
  overlayGradient: string;   // 이미지 오버레이용
  
  // 폰트 스타일
  headingStyle: string;      // 헤드라인 스타일
  bodyStyle: string;         // 본문 스타일
  
  // 배지/라벨 스타일
  badgeStyle: string;
  
  // 카드 스타일
  cardStyle: string;
}

export const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  '패션/의류': {
    name: '패션/의류',
    primaryColor: 'slate-900',
    secondaryColor: 'slate-600',
    backgroundColor: 'white',
    textColor: 'slate-900',
    accentColor: 'black',
    gradientFrom: 'from-slate-900',
    gradientTo: 'to-slate-700',
    overlayGradient: 'bg-gradient-to-t from-black/70 via-black/30 to-transparent',
    headingStyle: 'font-light tracking-wide uppercase',
    bodyStyle: 'font-light tracking-wide',
    badgeStyle: 'bg-black text-white text-xs tracking-widest uppercase',
    cardStyle: 'bg-white border border-slate-200',
  },
  
  '뷰티/화장품': {
    name: '뷰티/화장품',
    primaryColor: 'rose-500',
    secondaryColor: 'pink-400',
    backgroundColor: 'rose-50',
    textColor: 'slate-800',
    accentColor: 'rose-600',
    gradientFrom: 'from-rose-500',
    gradientTo: 'to-pink-400',
    overlayGradient: 'bg-gradient-to-t from-rose-900/60 via-transparent to-transparent',
    headingStyle: 'font-medium',
    bodyStyle: 'font-light',
    badgeStyle: 'bg-rose-500 text-white text-xs rounded-full',
    cardStyle: 'bg-white/80 backdrop-blur border border-rose-100',
  },
  
  '식품/건강': {
    name: '식품/건강',
    primaryColor: 'green-600',
    secondaryColor: 'orange-500',
    backgroundColor: 'green-50',
    textColor: 'slate-800',
    accentColor: 'green-700',
    gradientFrom: 'from-green-600',
    gradientTo: 'to-green-400',
    overlayGradient: 'bg-gradient-to-t from-green-900/60 via-transparent to-transparent',
    headingStyle: 'font-bold',
    bodyStyle: 'font-medium',
    badgeStyle: 'bg-green-600 text-white text-xs rounded-lg',
    cardStyle: 'bg-white border-2 border-green-100',
  },
  
  '생활/가전': {
    name: '생활/가전',
    primaryColor: 'blue-600',
    secondaryColor: 'slate-500',
    backgroundColor: 'slate-50',
    textColor: 'slate-800',
    accentColor: 'blue-700',
    gradientFrom: 'from-blue-600',
    gradientTo: 'to-blue-400',
    overlayGradient: 'bg-gradient-to-t from-slate-900/70 via-transparent to-transparent',
    headingStyle: 'font-semibold',
    bodyStyle: 'font-normal',
    badgeStyle: 'bg-blue-600 text-white text-xs',
    cardStyle: 'bg-white shadow-lg border border-slate-100',
  },
  
  '유아/키즈': {
    name: '유아/키즈',
    primaryColor: 'amber-400',
    secondaryColor: 'sky-400',
    backgroundColor: 'amber-50',
    textColor: 'slate-700',
    accentColor: 'amber-500',
    gradientFrom: 'from-amber-400',
    gradientTo: 'to-orange-300',
    overlayGradient: 'bg-gradient-to-t from-amber-900/50 via-transparent to-transparent',
    headingStyle: 'font-bold rounded-lg',
    bodyStyle: 'font-medium',
    badgeStyle: 'bg-amber-400 text-slate-800 text-xs rounded-full',
    cardStyle: 'bg-white rounded-2xl shadow-md border-2 border-amber-100',
  },
  
  '스포츠/레저': {
    name: '스포츠/레저',
    primaryColor: 'red-600',
    secondaryColor: 'slate-800',
    backgroundColor: 'slate-900',
    textColor: 'white',
    accentColor: 'red-500',
    gradientFrom: 'from-red-600',
    gradientTo: 'to-red-800',
    overlayGradient: 'bg-gradient-to-t from-red-900/80 via-black/40 to-transparent',
    headingStyle: 'font-black uppercase tracking-tight',
    bodyStyle: 'font-bold uppercase',
    badgeStyle: 'bg-red-600 text-white text-xs font-bold uppercase',
    cardStyle: 'bg-slate-800 border border-red-500/30',
  },
  
  '디지털/IT': {
    name: '디지털/IT',
    primaryColor: 'violet-600',
    secondaryColor: 'cyan-400',
    backgroundColor: 'slate-950',
    textColor: 'white',
    accentColor: 'cyan-400',
    gradientFrom: 'from-violet-600',
    gradientTo: 'to-cyan-400',
    overlayGradient: 'bg-gradient-to-t from-slate-950/90 via-violet-900/30 to-transparent',
    headingStyle: 'font-bold',
    bodyStyle: 'font-medium',
    badgeStyle: 'bg-gradient-to-r from-violet-600 to-cyan-400 text-white text-xs',
    cardStyle: 'bg-slate-900/80 backdrop-blur border border-violet-500/30',
  },
  
  '기타': {
    name: '기타',
    primaryColor: 'slate-700',
    secondaryColor: 'slate-500',
    backgroundColor: 'white',
    textColor: 'slate-800',
    accentColor: 'blue-600',
    gradientFrom: 'from-slate-700',
    gradientTo: 'to-slate-500',
    overlayGradient: 'bg-gradient-to-t from-black/60 via-transparent to-transparent',
    headingStyle: 'font-semibold',
    bodyStyle: 'font-normal',
    badgeStyle: 'bg-slate-700 text-white text-xs',
    cardStyle: 'bg-white border border-slate-200 shadow',
  },
};

// 카테고리에 맞는 테마 가져오기
export function getTheme(category: string): CategoryTheme {
  return CATEGORY_THEMES[category] || CATEGORY_THEMES['기타'];
}

