import { PrismaClient, type Role } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';

const prisma = new PrismaClient();

// MVP-only placeholder password for seeded accounts. Rotate before any real deployment.
const DEFAULT_PASSWORD = '123456';

const SEED_USERS: { id: string; role: Role; name: string }[] = [
  { id: 't0001', role: 'TEACHER', name: '王老师' },
  { id: 't0002', role: 'TEACHER', name: '李老师' },
  { id: 's0001', role: 'STUDENT', name: '张三' },
  { id: 's0002', role: 'STUDENT', name: '李四' },
  { id: 's0003', role: 'STUDENT', name: '王五' },
  { id: 's0004', role: 'STUDENT', name: '赵六' },
  { id: 's0005', role: 'STUDENT', name: '陈七' },
];

// Checkpoints match the Gate DSL shape from 项目分析文档.md:8.1:
// gates[].type ∈ regex | ai_socratic | test_pass, weight + pass_threshold,
// unlock.editorRegion, on_fail.ai_followup / valgrind_hint.
const FIB_L2_CHECKPOINTS = [
  {
    id: 'cp1',
    title: '递归边界条件',
    guide_question: '斐波那契递归的终止条件是什么？n 为 0 和 1 时分别应返回什么？',
    gates: [
      { type: 'regex', rule: '(n\\s*<=?\\s*[01]|边界|base\\s*case).{0,20}(返回|return)', weight: 0.4 },
      {
        type: 'ai_socratic',
        rubric: '回答需点出 n<=1 时直接返回 n，否则递归会无限下钻导致栈溢出',
        weight: 0.6,
      },
    ],
    pass_threshold: 0.7,
    unlock: { editorRegion: [5, 15], hints: ['提示：int fib(int n) 先写 n<=1 的出口'] },
    on_fail: { ai_followup: '如果 n=0 时函数仍在调用 fib(n-1)，会发生什么？' },
  },
  {
    id: 'cp2',
    title: '递归实现与隐藏测试',
    guide_question: '写出完整的 fib 递归函数，并跑通隐藏测试',
    gates: [{ type: 'test_pass', tests: 'hidden_tests/fib_2.json', weight: 1.0 }],
    unlock: { editorRegion: [16, 30] },
    on_fail: { valgrind_hint: true },
  },
];

const LINKED_LIST_CHECKPOINTS = [
  {
    id: 'cp1',
    title: '理解指针所有权',
    guide_question: '逆置过程中，哪一个指针负责“暂存下一个节点”？为什么必须暂存？',
    gates: [
      { type: 'regex', rule: '(next|nxt|tmp).*(保存|暂存|备份)', weight: 0.4 },
      {
        type: 'ai_socratic',
        rubric: '回答需点出“断链前保存 next，否则丢失后继”',
        weight: 0.6,
      },
    ],
    pass_threshold: 0.7,
    unlock: { editorRegion: [12, 25], hints: ['提示：prev=null, cur=head'] },
    on_fail: { ai_followup: '如果不暂存，cur->next 改掉后还能找到原 next 吗？' },
  },
  {
    id: 'cp2',
    title: '尾递归/迭代实现',
    guide_question: '写出迭代版三指针框架，跑通隐藏测试',
    gates: [{ type: 'test_pass', tests: 'hidden_tests/linked_list_3.json', weight: 1.0 }],
    unlock: { editorRegion: [26, 50] },
    on_fail: { valgrind_hint: true },
  },
];

const FIB_HIDDEN_TESTS = {
  tests: [
    { input: '0', expected: '0' },
    { input: '1', expected: '1' },
    { input: '2', expected: '1' },
    { input: '10', expected: '55' },
    { input: '20', expected: '6765' },
  ],
};

const LINKED_LIST_HIDDEN_TESTS = {
  tests: [
    { input: '1 2 3 4 5', expected: '5 4 3 2 1' },
    { input: '1', expected: '1' },
    { input: '', expected: '' },
    { input: '9 8 7', expected: '7 8 9' },
  ],
};

const SEED_TASKS = [
  {
    id: 'fib_L2',
    title: '斐波那契数列（递归）',
    checkpoints: FIB_L2_CHECKPOINTS,
    hiddenTests: FIB_HIDDEN_TESTS,
  },
  {
    id: 'linked_list_reverse',
    title: '单链表逆置',
    checkpoints: LINKED_LIST_CHECKPOINTS,
    hiddenTests: LINKED_LIST_HIDDEN_TESTS,
  },
];

async function main() {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { role: u.role, name: u.name, passwordHash },
      create: { id: u.id, role: u.role, name: u.name, passwordHash },
    });
  }
  console.log(`Seeded ${SEED_USERS.length} users (password: ${DEFAULT_PASSWORD})`);

  for (const t of SEED_TASKS) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: { title: t.title, checkpoints: t.checkpoints, hiddenTests: t.hiddenTests },
      create: t,
    });
  }
  console.log(`Seeded ${SEED_TASKS.length} tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
