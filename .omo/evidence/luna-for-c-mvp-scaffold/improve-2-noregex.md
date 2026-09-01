# Evidence: Remove regex gate, delegate to AI (ai_socratic)

## Task Summary
Removed the regex gate type from the checkpoint DSL, simplifying the verification funnel from three tiers (regex → AI → test_pass) to two tiers (AI → test_pass). All cp1 checkpoints now use pure ai_socratic gates with weight 1.0.

## Files Modified

### 1. src/lib/checkpoint/schema.ts
- Removed `RegexGateSchema` definition (lines 25-30)
- Updated `GateSchema` discriminated union to only include `SocraticGateSchema` and `TestPassGateSchema`
- Removed `RegexGate` type export
- Updated doc comment to reflect only two gate types

### 2. src/lib/checkpoint/evaluate.ts
- Removed entire `case 'regex'` branch from `evaluateGate()` switch (was lines 210-235)
- Updated doc comment from "三级漏斗" to "两级漏斗"
- No more references to `gate.rule`

### 3. tasks/fib_L2.json
- cp1 gates changed from:
  ```json
  [
    {"type": "regex", "rule": "...", "weight": 0.4},
    {"type": "ai_socratic", "rubric": "...", "weight": 0.6}
  ]
  ```
  to:
  ```json
  [
    {"type": "ai_socratic", "rubric": "回答需点出 n<=1 时直接返回 n，否则递归会无限下钻导致栈溢出", "weight": 1.0}
  ]
  ```

### 4. tasks/linked_list_reverse.json
- cp1 gates changed from:
  ```json
  [
    {"type": "regex", "rule": "...", "weight": 0.4},
    {"type": "ai_socratic", "rubric": "...", "weight": 0.6}
  ]
  ```
  to:
  ```json
  [
    {"type": "ai_socratic", "rubric": "回答需点出“断链前保存 next，否则丢失后继”", "weight": 1.0}
  ]
  ```

### 5. src/app/api/checkpoint/verify/route.ts
- Line 268: Changed `model: gate.model ?? (gate.type === 'regex' ? 'regex-engine' : 'unknown')` to `model: gate.model ?? 'unknown'`
- Updated doc comment from "三级漏斗" to "两级漏斗"
- Updated inline comment from "三级漏斗求值：regex 初筛 → AI 复核 → test_pass 真判题" to "两级漏斗求值：AI 复核 → test_pass 真判题"

## Verification Results

### Build & Lint
```bash
$ pnpm build
✓ Compiled successfully
   Linting and checking validity of types ...
✓ Generating static pages (15/15)
   Finalizing page optimization ...

$ pnpm lint
✔ No ESLint warnings or errors
```

### Task JSON Parsing
```bash
$ pnpm exec tsx scripts/verify-tasks.ts
Task: fib_L2
  cp1: gates = [ { type: 'ai_socratic', weight: 1 } ]
  cp2: gates = [ { type: 'test_pass', weight: 1 } ]
Task: linked_list_reverse
  cp1: gates = [ { type: 'ai_socratic', weight: 1 } ]
  cp2: gates = [ { type: 'test_pass', weight: 1 } ]
All tasks parsed successfully!
```

## Key Changes Summary

| Aspect | Before | After |
|--------|--------|-------|
| Gate types | regex, ai_socratic, test_pass | ai_socratic, test_pass |
| Funnel tiers | 3 (regex → AI → test) | 2 (AI → test) |
| fib_L2 cp1 | regex(0.4) + ai_socratic(0.6) | ai_socratic(1.0) |
| linked_list_reverse cp1 | regex(0.4) + ai_socratic(0.6) | ai_socratic(1.0) |
| verify route model fallback | regex-engine / unknown | unknown |

## No Regressions
- ✅ Build passes
- ✅ Lint passes (0 errors, 0 warnings)
- ✅ Task JSON schema validation passes
- ✅ TypeScript compilation passes
- ✅ No hardcoded 'regex' strings remain in evaluation logic
- ✅ Gate union type correctly narrowed to 'ai_socratic' | 'test_pass'