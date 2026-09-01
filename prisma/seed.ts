import { PrismaClient, type Role } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';

const prisma = new PrismaClient();

// MVP-only placeholder password for seeded accounts. Rotate before any real deployment.
const DEFAULT_PASSWORD = '123456';

const SEED_USERS: { id: string; role: Role; name: string }[] = [
  { id: 'a0001', role: 'ADMIN', name: '管理员' },
  { id: 't0001', role: 'TEACHER', name: '王老师' },
  { id: 't0002', role: 'TEACHER', name: '李老师' },
  { id: 's0001', role: 'STUDENT', name: '张三' },
  { id: 's0002', role: 'STUDENT', name: '李四' },
  { id: 's0003', role: 'STUDENT', name: '王五' },
  { id: 's0004', role: 'STUDENT', name: '赵六' },
  { id: 's0005', role: 'STUDENT', name: '陈七' },
];

// Checkpoints mirror tasks/*.json (tasks 真源，prisma 仅镜像)
// v2: kind ai/code + aiChain / initialCode / testsPath / allowAIGenerateTests
const FIB_L2_CHECKPOINTS = [
  {
    id: 'cp1',
    title: '递归边界条件',
    guide_question: '斐波那契递归的终止条件是什么？n 为 0 和 1 时分别应返回什么？',
    kind: 'ai',
    intro: '思考递归何时停止，避免无限下钻。',
    aiChain: ['n为0/1时返回?', '若缺少边界会发生什么？栈会如何增长？', '如何用一句话描述出口条件？'],
    gates: [
      {
        type: 'ai_socratic',
        rubric: '回答需点出 n<=1 时直接返回 n，否则递归会无限下钻导致栈溢出',
        weight: 1.0,
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
    kind: 'code',
    initialCode: '// TODO: 实现 int fib(int n)\n// 提示：先处理 n<=1 的边界，再返回 fib(n-1)+fib(n-2)\nint fib(int n) {\n  // 请在此填入你的实现\n}\n',
    testsPath: 'hidden_tests/fib_2.json',
    tests: 'hidden_tests/fib_2.json',
    allowAIGenerateTests: false,
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
    kind: 'ai',
    intro: '断链前若丢失 next，链表后半段将不可达。',
    aiChain: ['哪个指针暂存下一个节点？', '若不暂存，cur->next 改写后会怎样？', '谁分配/谁释放该暂存指针指向的内存？'],
    gates: [
      {
        type: 'ai_socratic',
        rubric: '回答需点出“断链前保存 next，否则丢失后继”',
        weight: 1.0,
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
    kind: 'code',
    initialCode:
      '// TODO: 逆置单链表\n// struct Node { int val; struct Node *next; };\n// struct Node* reverseList(struct Node* head) {\n//   struct Node *prev = NULL, *cur = head, *next = NULL;\n//   // 请补全循环体\n// }\n',
    testsPath: 'hidden_tests/linked_list_3.json',
    tests: 'hidden_tests/linked_list_3.json',
    allowAIGenerateTests: true,
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
    intro: '斐波那契数列定义为 fib(0)=0, fib(1)=1, fib(n)=fib(n-1)+fib(n-2)。本任务先理解递归边界，再完成递归实现。',
    checkpointMode: 'sequential',
    checkpoints: FIB_L2_CHECKPOINTS,
    hiddenTests: FIB_HIDDEN_TESTS,
  },
  {
    id: 'linked_list_reverse',
    title: '单链表逆置',
    intro: '单链表逆置要求在 O(1) 额外空间内就地反转指针方向，关键在于断链前暂存后继。先回答指针所有权问题，再完成三指针实现。',
    checkpointMode: 'sequential',
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
      update: {
        title: t.title,
        intro: t.intro,
        checkpointMode: t.checkpointMode,
        checkpoints: t.checkpoints,
        hiddenTests: t.hiddenTests,
      },
      create: {
        id: t.id,
        title: t.title,
        intro: t.intro,
        checkpointMode: t.checkpointMode,
        checkpoints: t.checkpoints,
        hiddenTests: t.hiddenTests,
      },
    });
  }
  console.log(`Seeded ${SEED_TASKS.length} tasks`);

  // Seed Class
  const classDemo = await prisma.class.upsert({
    where: { code: 'CLS001' },
    update: { name: '示例班级', teacherId: 't0001' },
    create: { id: 'class-demo', name: '示例班级', code: 'CLS001', teacherId: 't0001' },
  });
  console.log(`Seeded class: ${classDemo.name} (${classDemo.code})`);

  // Seed ClassEnrollment for s0001, s0002, s0003
  const studentIds = ['s0001', 's0002', 's0003'];
  for (const studentId of studentIds) {
    await prisma.classEnrollment.upsert({
      where: { classId_studentId: { classId: classDemo.id, studentId } },
      update: {},
      create: { classId: classDemo.id, studentId },
    });
  }
  console.log(`Seeded ${studentIds.length} class enrollments`);

  // Seed TaskAssignment (fib_L2 -> class-demo, deadline 7 days from now)
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  await prisma.taskAssignment.upsert({
    where: { id: 'assignment-fib_L2-class-demo' },
    update: { taskId: 'fib_L2', classId: classDemo.id, teacherId: 't0001', deadline },
    create: { id: 'assignment-fib_L2-class-demo', taskId: 'fib_L2', classId: classDemo.id, teacherId: 't0001', deadline },
  });
  console.log(`Seeded task assignment: fib_L2 -> ${classDemo.name} (deadline: ${deadline.toISOString()})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
