---
name: USG Project Architecture
description: Unity Stake Global app structure — key files and roles
---

Main app entry: components/usg-app.tsx (replaces old acua-app.tsx)
Page: app/page.tsx imports UsgApp (not AcuaApp)
ABI/helpers: lib/contract.ts — uses STAKING_ABI for UnityStakeGlobal contract
Wallet hook: hooks/use-wallet.ts — checks owner1, owner2, AND registered owners; no tx.origin
Images: public/bg-usg.jpg (background), public/fund-usg.jpg (fund panel)
Theme: app/globals.css — dark navy + gold (oklch 0.78 0.18 78)
Dev port: 5000 (package.json dev script: `next dev -p 5000`)

**Why:** Complete rewrite from "Acua Staking" (H2O token) to "Unity Stake Global" (USG token, 0x4E6791...)

**How to apply:** When editing the app, always edit usg-app.tsx. Old files (acua-app.tsx, stake-panel.tsx, owner-panel.tsx) exist but are NOT imported anywhere — safe to delete if needed.
