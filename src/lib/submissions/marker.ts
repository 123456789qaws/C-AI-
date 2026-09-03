/**
 * 提交完成闭环的持久标记（Bug5-submit，零 schema 变更设计）。
 *
 * Hand in 复用 CheckpointProgress，以 checkpointId = SUBMITTED_MARKER
 * 的特殊行标记「已提交」（@@id([studentId,taskId,checkpointId]) 无外键约束，
 * 任意 marker 字符串合法；班级删除级联不受影响）。
 * 查询进度时须排除该行（它不是真实关卡）。
 */
export const SUBMITTED_MARKER = '_submitted';
