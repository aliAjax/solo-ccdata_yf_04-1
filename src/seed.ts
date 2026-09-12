import type { Phrase } from './types';

/** Built-in starter library, written to IndexedDB on first launch only. */
export const SEED_PHRASES: Phrase[] = [
  { id: 'seed-01', text: "It's nice to meet you.", translation: '很高兴认识你。', tag: '日常', level: '入门', createdAt: 1 },
  { id: 'seed-02', text: 'Could I get a cup of coffee, please?', translation: '请给我一杯咖啡，好吗？', tag: '日常', level: '入门', createdAt: 2 },
  { id: 'seed-03', text: 'How much is this?', translation: '这个多少钱？', tag: '旅行', level: '入门', createdAt: 3 },
  { id: 'seed-04', text: 'What time does the meeting start?', translation: '会议几点开始？', tag: '工作', level: '入门', createdAt: 4 },
  { id: 'seed-05', text: 'Let me know if you need anything else.', translation: '如果还需要别的，随时告诉我。', tag: '日常', level: '进阶', createdAt: 5 },
  { id: 'seed-06', text: "I'd like to check in for my flight.", translation: '我想办理登机手续。', tag: '旅行', level: '进阶', createdAt: 6 },
  { id: 'seed-07', text: 'Could you walk me through the next step?', translation: '你能带我过一遍下一步吗？', tag: '工作', level: '进阶', createdAt: 7 },
  { id: 'seed-08', text: 'The morning light feels different today.', translation: '今天的晨光感觉不太一样。', tag: '情感', level: '进阶', createdAt: 8 },
  { id: 'seed-09', text: "It's been a while since we last caught up.", translation: '我们有一阵子没好好聊过了。', tag: '情感', level: '挑战', createdAt: 9 },
  { id: 'seed-10', text: 'I appreciate your patience and thoughtful feedback.', translation: '感谢你的耐心和细致的反馈。', tag: '表达', level: '挑战', createdAt: 10 },
  { id: 'seed-11', text: 'Could you elaborate on that point a little further?', translation: '那一点你能再展开讲讲吗？', tag: '面试', level: '挑战', createdAt: 11 },
  { id: 'seed-12', text: 'She sells seashells by the seashore.', translation: '绕口令：她在海边卖贝壳。', tag: '发音', level: '挑战', createdAt: 12 },
];
