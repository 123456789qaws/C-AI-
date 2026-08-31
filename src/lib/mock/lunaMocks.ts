export interface LunaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface HeatDataItem {
  taskId: string;
  taskName: string;
  avgScore: number;
  submissions: number;
  passRate: number;
}

export const mockMessages: LunaMessage[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content: '你好！我是 Luna，你的 C 语言学习助教。今天想练习哪个题目？',
    timestamp: '09:00',
  },
  {
    id: 'msg-2',
    role: 'user',
    content: '我想做指针入门这个题目',
    timestamp: '09:01',
  },
  {
    id: 'msg-3',
    role: 'assistant',
    content: '好的，指针是 C 语言的核心概念。先思考一下：指针变量存储的是什么？',
    timestamp: '09:01',
  },
  {
    id: 'msg-4',
    role: 'user',
    content: '存储的是内存地址',
    timestamp: '09:02',
  },
  {
    id: 'msg-5',
    role: 'assistant',
    content: '正确！那 `int *p = &a;` 这行代码中，`p` 的类型是什么？`*p` 又代表什么？',
    timestamp: '09:02',
  },
  {
    id: 'msg-6',
    role: 'user',
    content: 'p 是 int* 类型，*p 是 a 的值',
    timestamp: '09:03',
  },
  {
    id: 'msg-7',
    role: 'assistant',
    content: '完全正确！Luna 只问不给，继续加油～ 那如果要修改 a 的值，通过 p 应该怎么写？',
    timestamp: '09:03',
  },
];

export const mockHeatData: HeatDataItem[] = [
  { taskId: 'task-1', taskName: 'Hello World', avgScore: 92, submissions: 45, passRate: 0.98 },
  { taskId: 'task-2', taskName: '变量与类型', avgScore: 85, submissions: 42, passRate: 0.93 },
  { taskId: 'task-3', taskName: '条件判断', avgScore: 78, submissions: 40, passRate: 0.85 },
  { taskId: 'task-4', taskName: '循环结构', avgScore: 72, submissions: 38, passRate: 0.79 },
  { taskId: 'task-5', taskName: '数组基础', avgScore: 68, submissions: 35, passRate: 0.71 },
  { taskId: 'task-6', taskName: '函数定义', avgScore: 65, submissions: 33, passRate: 0.67 },
  { taskId: 'task-7', taskName: '指针入门', avgScore: 58, submissions: 30, passRate: 0.57 },
  { taskId: 'task-8', taskName: '结构体', avgScore: 55, submissions: 28, passRate: 0.54 },
];

export const mockTimeline = [
  { time: '09:15', student: '张三', task: '指针入门', action: '提交代码', status: '通过' as const },
  { time: '09:18', student: '李四', task: '循环结构', action: '提交代码', status: '失败' as const },
  { time: '09:22', student: '王五', task: '数组基础', action: '提交代码', status: '通过' as const },
  {
    time: '09:25',
    student: '赵六',
    task: '函数定义',
    action: '开始编码',
    status: '进行中' as const,
  },
  { time: '09:28', student: '钱七', task: '条件判断', action: '提交代码', status: '通过' as const },
  {
    time: '09:30',
    student: '孙八',
    task: 'Hello World',
    action: '提交代码',
    status: '通过' as const,
  },
  { time: '09:33', student: '周九', task: '结构体', action: '开始编码', status: '进行中' as const },
  {
    time: '09:35',
    student: '吴十',
    task: '变量与类型',
    action: '提交代码',
    status: '通过' as const,
  },
];

export const mockStats = {
  totalStudents: 45,
  activeNow: 12,
  avgScore: 71.6,
  totalSubmissions: 291,
};
