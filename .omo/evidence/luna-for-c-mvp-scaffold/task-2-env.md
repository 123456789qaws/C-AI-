# Task 2 Evidence: .env 体系与基础配置

## Verification Checklist

### Files Created
- [x] `.env.example` - Environment template with all required variables
- [x] `src/lib/env.ts` - Zod validation schema
- [x] `src/lib/config.ts` - Server-only guarded config export
- [x] `src/lib/providers/ai/mock.ts` - Mock AI provider placeholder

### Functionality Verified
- [x] `pnpm build` passes without errors
- [x] No DEEPSEEK string leaked into `.next/static` (verified with `Get-ChildItem -Path ".next\static" -Recurse -File | Select-String -Pattern "DEEPSEEK"` - no output)
- [x] Client import of config throws server-only error (tested with test client component)

### Build Output
```
Route (app)                              Size     First Load JS
┌ ○ /                                    5.34 kB        92.6 kB
└ ○ /_not-found                          873 B          88.1 kB
+ First Load JS shared by all            87.3 kB
  ├ chunks/302cc100-40c91ed9df27a64b.js  53.6 kB
  ├ chunks/573-904ea8a3d4c98fad.js       31.8 kB
  └ other shared chunks (total)          1.86 kB
```

### Leak Check Command & Result
```powershell
Get-ChildItem -Path ".next\static" -Recurse -File | Select-String -Pattern "DEEPSEEK"
# No output = PASS
```

### Server-Only Error Verification
Created test client component at `src/app/test-client/page.tsx`:
```tsx
'use client';
import { env } from '@/lib/config';
export default function TestClientPage() {
  return <div>Test: {env.AI_PROVIDER}</div>;
}
```

Build failed with expected error:
```
Error: You're importing a component that needs server-only. That only works in a Server Component...
```

### Dependencies Added
- `zod@4.4.3` - Runtime validation
- `server-only@0.0.1` - Next.js server-only guard

### Environment Variables Configured
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | postgresql://postgres:postgres@localhost:5432/luna_c?schema=public | PostgreSQL connection string |
| AI_PROVIDER | No | deepseek-api | deepseek-api \| qwen-local \| mock |
| DEEPSEEK_API_KEY | Conditional | - | Required when AI_PROVIDER=deepseek-api |
| QWEN_URL | Conditional | - | Required when AI_PROVIDER=qwen-local |
| JUDGE_MODE | No | auto | auto \| docker \| local |
| JUDGE_URL | Conditional | - | Required when JUDGE_MODE=docker or local |
| JWT_SECRET | Yes | - | Min 16 characters |

### Security Notes
- `.env` is NOT committed (only `.env.example`)
- All provider files with secrets start with `import 'server-only'`
- Config is only accessible in server components, API routes, and server actions
- Client bundle contains no environment variables