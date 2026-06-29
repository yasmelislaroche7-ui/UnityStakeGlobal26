---
name: USG Contract Details
description: UnityStakeGlobal Solidity contract improvements and key rules
---

Contract file: lib/contracts/stakeglobal.sol
Token: USG = 0x4E6791bAc7c2E8c52543C3EA85D1C66a917206b5
owner1: deployer (immutable) — NOT excluded from owner list but EXCLUDED from commission distribution
owner2: 0xc2ef127734f296952de75c1b58a6cec605cc2e59 (immutable) — receives commission, full admin rights

Key rules:
- Max APR: 20,000% = MAX_APR_BPS = 2_000_000 (capped in currentAPR())
- No tx.origin — onlyEOA modifier removed entirely
- recoverERC20 / recoverETH / withdrawRewardPool — only onlyConfigOwner (owner1/owner2)
- removeInactiveStakers — any registered owner
- directFund() — no Permit2, just ERC20 approve + transferFrom (for easier frontend funding)
- owner1 EXCLUDED from commission split (_distributeCommission skips owner1 address)
- receive() external payable added to accept ETH for recovery

**Why:** User specified owner1 (deployer) should not receive commission, only for deploy/management.
**How to apply:** Any future commission distribution changes must keep the owner1 exclusion logic.
