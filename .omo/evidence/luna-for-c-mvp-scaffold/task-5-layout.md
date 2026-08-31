# Task 5 Evidence: App Router Layout & Basic Routing

## Date: 2026-08-31

## Summary
Successfully built the App Router layout with three-column IDE structure and basic routing for Luna for C MVP.

## Files Created/Verified

### 1. src/app/layout.tsx (Root Layout)
- ✅ HTML lang="zh-CN"
- ✅ Metadata with title, description, OpenGraph
- ✅ Imports globals.css
- ✅ Uses Inter font with CSS variable

### 2. src/app/(ide)/layout.tsx (IDE Layout - Three Column)
- ✅ Flex container: `h-screen w-full overflow-hidden`
- ✅ Left sidebar (FileTree): `w-60` (240px), `border-r`, `bg-card`
- ✅ Main editor area: `flex-1 min-w-0 overflow-hidden`
- ✅ Right sidebar (Luna AI): `w-[360px]`, `border-l`, `bg-card`
- ✅ Toaster placeholder for notifications
- ✅ No business logic in layout

### 3. src/app/(ide)/page.tsx (IDE Page Placeholder)
- ✅ Monaco workspace placeholder with "Monaco workspace — checkpoint locked"
- ✅ Uses Card, CardHeader, CardTitle, CardContent from shadcn
- ✅ Guide question mock with read-only textarea
- ✅ Verify button placeholder (disabled, outline variant)
- ✅ Note: "验证按钮为占位符，无业务逻辑"

### 4. src/app/api/health/route.ts (Health Check Endpoint)
- ✅ GET handler returns `{ok: true, ts: Date.now(), version: '0.1.0'}`
- ✅ Uses NextResponse.json
- ✅ No authentication required

### 5. src/components/ui/button.tsx
- ✅ Base UI Button with cva variants (default, outline, secondary, ghost, destructive, link)
- ✅ Sizes: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg
- ✅ Uses @base-ui/react ButtonPrimitive
- ✅ Proper TypeScript types with VariantProps

### 6. src/components/ui/card.tsx
- ✅ Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent
- ✅ Supports size variants (default, sm)
- ✅ Uses CSS variables for spacing
- ✅ Proper data-slot attributes for styling

### 7. src/components/editor/FileTree.tsx (Placeholder)
- ✅ Card wrapper with header "文件树"
- ✅ Placeholder text: "文件树占位符 - 待实现"
- ✅ Full height flex column layout

## Verification Results

### pnpm build
```
Route (app)                              Size     First Load JS
┌ ○ /                                    3.15 kB        90.4 kB
├ ○ /_not-found                          873 B          88.1 kB
└ ○ /api/health                          0 B                0 B
+ First Load JS shared by all            87.3 kB
```
- ✅ Root `/` serves IDE page (3.15 kB)
- ✅ `/api/health` route exists (0 B - API route)
- ✅ Compiled successfully
- ✅ Static pages generated

### pnpm lint
- ✅ 0 errors
- ✅ 0 warnings

### Functionality Verified
- ✅ GET /api/health returns `{ok: true, ts: ..., version: '0.1.0'}`
- ✅ `/` shows three-column placeholder with FileTree, Monaco workspace, Luna AI panel
- ✅ No business logic in layout files
- ✅ Server/client components correctly separated (all components are RSC by default)

## Key Decisions
1. **Removed root page.tsx** - The `(ide)` route group serves at `/`, so the default Next.js landing page was removed to avoid conflict
2. **Route group (ide) doesn't affect URL** - Pages inside `(ide)` are served at root level paths
3. **All components are RSC** - No 'use client' directives needed for these placeholder components
4. **Tailwind CSS variables** - Used for consistent theming (border, bg-card, text-foreground, etc.)

## Gotchas
1. **Route group conflict** - Having both `src/app/page.tsx` and `src/app/(ide)/page.tsx` causes the root page to take precedence. Removed root page.tsx.
2. **Build output size** - IDE page is 3.15 kB vs 5.34 kB for default page, confirming correct page is served.

## Next Steps
- Task 6: Add Monaco Editor integration
- Task 7: Add Luna AI chat panel implementation
- Task 8: Add file tree with actual file operations