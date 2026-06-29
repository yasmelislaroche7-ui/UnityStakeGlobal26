// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

// ============================================================
//  PERMIT2 INTERFACE
// ============================================================
interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }
    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }
    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;

    function allowance(address user, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce);
}

/**
 * @title  UnityStakeGlobal
 * @notice Contrato de staking flexible para el token USG en WorldChain.
 *
 * Características:
 *  - APR variable (impulsado por el fondo de recompensas, no configurable por admin)
 *  - APR máximo capeado a 20 000% (2 000 000 BPS)
 *  - Comisión del 5% sobre stake / unstake / claim (configurable solo por owner1 + owner2)
 *  - 2.5% de todas las comisiones → fondo de staking (aumenta APR automáticamente)
 *  - 2.5% de todas las comisiones → distribuido equitativamente entre owners registrados
 *    (owner1/deployer EXCLUIDO de comisiones, solo gestión)
 *  - Cualquiera puede fondear el pool (aumenta APR)
 *  - Máximo 100 owners registrados
 *  - Las recompensas se acumulan continuamente por segundo
 *  - Recuperación de cualquier ERC20 enviado por error (solo owner1/owner2)
 *  - Recuperación de ETH (solo owner1/owner2)
 *  - Retiro del fondo de recompensas (solo owner1/owner2)
 *  - Eliminación de stakers inactivos
 *  - Sin tx.origin — compatible con contratos y EOA
 *  - Permit2 para aprobaciones sin gas
 *  - Pausable por owner1 o owner2
 *  - Compatible con Solidity ^0.8.20 y World Chain (chainId 480)
 *
 * @author Unity Stake Global (USG)
 */
contract UnityStakeGlobal is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ================================================================
    //  CONSTANTES
    // ================================================================

    /// @notice Dirección universal de Permit2 (Uniswap)
    address public constant PERMIT2_ADDRESS = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Máximo de owners registrados (incluyendo owner1 y owner2)
    uint256 public constant MAX_OWNERS = 100;

    /// @notice Comisión máxima: 20% = 2000 BPS
    uint256 public constant MAX_COMMISSION_BPS = 2000;

    /// @notice Mínimo de USG para hacer stake (1 USG con 18 decimales)
    uint256 public constant MIN_STAKE_AMOUNT = 1e18;

    /// @notice Precisión para cálculo de recompensas acumuladas
    uint256 public constant PRECISION = 1e18;

    /// @notice Segundos en un año (365 días)
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @notice APR máximo en BPS: 20 000% = 2 000 000 BPS
    uint256 public constant MAX_APR_BPS = 2_000_000;

    // ================================================================
    //  IMMUTABLES
    // ================================================================

    /// @notice Token USG (ERC20)
    IERC20 public immutable USG;

    /// @notice Contrato Permit2
    IPermit2 public immutable permit2;

    /// @notice Owner1: deployer — permanente, no recibe comisión
    address public immutable owner1;

    /// @notice Owner2: 0xc2ef... — permanente, recibe comisión
    address public immutable owner2;

    // ================================================================
    //  CONFIGURACIÓN DE COMISIÓN
    // ================================================================

    /// @notice Comisión en BPS (500 = 5%). Solo cambiable por owner1 o owner2.
    uint256 public commissionBps = 500;

    // ================================================================
    //  REGISTRO DE OWNERS
    // ================================================================

    address[] private _ownerList;
    mapping(address => bool) public isOwner;

    // ================================================================
    //  ESTADO DEL STAKING
    // ================================================================

    /// @notice Información de stake de cada usuario
    struct StakeInfo {
        uint256 amount;       // Cantidad neta en stake (después de comisión)
        uint256 rewardDebt;   // Snapshot de accRewardPerToken al último update
        uint256 totalEarned;  // Recompensas totales reclamadas por este usuario
    }

    mapping(address => StakeInfo) public stakes;
    address[] private _stakerList;
    mapping(address => bool) private _isStaker;

    uint256 public totalStaked;
    uint256 public rewardPool;         // USG disponibles para distribuir como recompensas
    uint256 public accRewardPerToken;  // Escalado por PRECISION
    uint256 public lastRewardTime;

    // ================================================================
    //  BALANCES DE COMISIÓN POR OWNER
    // ================================================================

    /// @notice Comisión acumulada pendiente de cada owner
    mapping(address => uint256) public ownerCommissionBalance;

    /// @notice Total reclamado por cada owner (estadística histórica)
    mapping(address => uint256) public ownerTotalClaimed;

    // ================================================================
    //  ESTADÍSTICAS GLOBALES
    // ================================================================

    uint256 public totalDeposited;        // Total fondeado al pool de recompensas
    uint256 public totalCommissionPool;   // Total comisiones auto-enviadas al pool
    uint256 public totalCommissionOwners; // Total comisiones distribuidas a owners
    uint256 public totalClaimed;          // Total recompensas pagadas a stakers
    uint256 public totalWithdrawn;        // Total principal retirado
    uint256 public totalGainedCommission; // Total comisión cobrada de todas las ops
    uint256 public totalPoolWithdrawn;    // Total retirado del pool por owners autorizados

    // ================================================================
    //  EVENTOS
    // ================================================================

    event Staked(address indexed user, uint256 gross, uint256 net, uint256 commission);
    event Unstaked(address indexed user, uint256 gross, uint256 net, uint256 commission);
    event RewardClaimed(address indexed user, uint256 gross, uint256 net, uint256 commission);
    event DirectFunded(address indexed funder, uint256 amount);
    event Funded(address indexed funder, uint256 amount);
    event CommissionUpdated(address indexed by, uint256 oldBps, uint256 newBps);
    event OwnerAdded(address indexed by, address indexed newOwner);
    event OwnerRemoved(address indexed by, address indexed removedOwner);
    event OwnerCommissionClaimed(address indexed owner, uint256 amount);
    event ContractPaused(address indexed by);
    event ContractUnpaused(address indexed by);
    event PoolUpdated(uint256 rewardPool, uint256 accRewardPerToken);
    event ERC20Recovered(address indexed token, uint256 amount, address indexed to);
    event ETHRecovered(uint256 amount, address indexed to);
    event PoolWithdrawn(address indexed by, uint256 amount, address indexed to);
    event InactiveStakersRemoved(uint256 count);

    // ================================================================
    //  MODIFICADORES
    // ================================================================

    /// @notice Solo owner1 o owner2 pueden ejecutar funciones de configuración/retiro
    modifier onlyConfigOwner() {
        require(msg.sender == owner1 || msg.sender == owner2, "USG: not authorized");
        _;
    }

    /// @notice Revierte si amount es cero
    modifier nonZero(uint256 amount) {
        require(amount > 0, "USG: zero amount");
        _;
    }

    // ================================================================
    //  CONSTRUCTOR
    // ================================================================

    /**
     * @param _usgToken Dirección del token USG
     * @param _permit2  Dirección del contrato Permit2
     */
    constructor(address _usgToken, address _permit2) {
        require(_usgToken != address(0), "USG: invalid token");
        require(_permit2 != address(0), "USG: invalid permit2");

        USG = IERC20(_usgToken);
        permit2 = IPermit2(_permit2);
        owner1 = msg.sender;
        owner2 = 0xc2ef127734f296952de75c1b58a6cec605cc2e59;

        // owner1 es registrado pero NO recibe comisión (solo para deploy/gestión)
        _addOwnerInternal(msg.sender);
        if (owner2 != msg.sender) {
            _addOwnerInternal(owner2);
        }

        lastRewardTime = block.timestamp;
    }

    /// @notice Permite recibir ETH (para recover)
    receive() external payable {}

    // ================================================================
    //  MATEMÁTICA DEL POOL
    // ================================================================

    /**
     * @dev Actualiza el acumulado de recompensas por token basado en el tiempo transcurrido.
     *      Se llama internamente antes de cualquier cambio de estado del staking.
     */
    function _updatePool() internal {
        uint256 _lastTime = lastRewardTime;
        if (block.timestamp <= _lastTime) return;

        if (totalStaked == 0 || rewardPool == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - _lastTime;
        // rewardPerSecond = rewardPool / SECONDS_PER_YEAR (distribución anual)
        uint256 rewardPerSecond = rewardPool / SECONDS_PER_YEAR;
        uint256 reward = rewardPerSecond * elapsed;
        if (reward > rewardPool) reward = rewardPool;

        rewardPool -= reward;
        accRewardPerToken += (reward * PRECISION) / totalStaked;
        lastRewardTime = block.timestamp;

        emit PoolUpdated(rewardPool, accRewardPerToken);
    }

    /**
     * @notice Retorna la recompensa pendiente de un usuario (antes de comisión).
     * @param user Dirección del usuario
     */
    function pendingReward(address user) public view returns (uint256) {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0) return 0;

        uint256 _acc = accRewardPerToken;
        if (totalStaked > 0 && rewardPool > 0) {
            uint256 elapsed = block.timestamp - lastRewardTime;
            uint256 reward = (rewardPool / SECONDS_PER_YEAR) * elapsed;
            if (reward > rewardPool) reward = rewardPool;
            _acc += (reward * PRECISION) / totalStaked;
        }
        return (s.amount * (_acc - s.rewardDebt)) / PRECISION;
    }

    /**
     * @notice APR actual en BPS (variable, impulsado por el pool).
     *         Capeado a MAX_APR_BPS (20 000% = 2 000 000 BPS).
     */
    function currentAPR() public view returns (uint256) {
        if (totalStaked == 0 || rewardPool == 0) return 0;
        uint256 apr = (rewardPool * 10000) / totalStaked;
        return apr > MAX_APR_BPS ? MAX_APR_BPS : apr;
    }

    /**
     * @notice APR actual como porcentaje con 2 decimales (ej: 1500 = 15.00%).
     *         Útil para visualización, capeado a 20 000%.
     */
    function currentAPRPercent() public view returns (uint256 bps, uint256 whole, uint256 decimals2) {
        bps = currentAPR();
        whole = bps / 100;
        decimals2 = bps % 100;
    }

    // ================================================================
    //  DISTRIBUCIÓN DE COMISIONES
    // ================================================================

    /**
     * @dev Distribuye la comisión: 50% al pool, 50% a owners elegibles.
     *      owner1 (deployer) está EXCLUIDO de recibir comisión.
     */
    function _distributeCommission(uint256 commission) internal {
        if (commission == 0) return;
        totalGainedCommission += commission;

        uint256 toPool = commission / 2;
        uint256 toOwners = commission - toPool;

        rewardPool += toPool;
        totalCommissionPool += toPool;

        // Contar owners elegibles (excluir owner1)
        uint256 len = _ownerList.length;
        uint256 eligibleCount;
        unchecked {
            for (uint256 i = 0; i < len; i++) {
                if (_ownerList[i] != owner1) eligibleCount++;
            }
        }

        if (eligibleCount > 0 && toOwners > 0) {
            uint256 perOwner = toOwners / eligibleCount;
            uint256 remainder = toOwners - (perOwner * eligibleCount);
            unchecked {
                for (uint256 i = 0; i < len; i++) {
                    if (_ownerList[i] != owner1) {
                        ownerCommissionBalance[_ownerList[i]] += perOwner;
                    }
                }
            }
            // Resto va a owner2
            if (remainder > 0) ownerCommissionBalance[owner2] += remainder;
            totalCommissionOwners += toOwners;
        } else {
            // Sin owners elegibles → todo al pool
            rewardPool += toOwners;
            totalCommissionPool += toOwners;
        }
    }

    // ================================================================
    //  ACCIONES DE STAKING
    // ================================================================

    /**
     * @notice Hacer stake de USG usando Permit2 (sin aprobación previa en cadena).
     * @param amount    Cantidad bruta a stakear.
     * @param _permit   Estructura Permit2.
     * @param signature Firma Permit2.
     */
    function stake(
        uint256 amount,
        IPermit2.PermitTransferFrom calldata _permit,
        bytes calldata signature
    ) external nonReentrant whenNotPaused nonZero(amount) {
        require(amount >= MIN_STAKE_AMOUNT, "USG: below minimum");
        require(_permit.permitted.token == address(USG), "USG: wrong token");
        require(_permit.permitted.amount >= amount, "USG: permit amount too low");
        require(_permit.deadline >= block.timestamp, "USG: permit expired");

        permit2.permitTransferFrom(
            _permit,
            IPermit2.SignatureTransferDetails({to: address(this), requestedAmount: amount}),
            msg.sender,
            signature
        );

        _updatePool();

        uint256 commission = (amount * commissionBps) / 10000;
        uint256 netAmount = amount - commission;

        _settlePending(msg.sender);

        if (!_isStaker[msg.sender]) {
            _stakerList.push(msg.sender);
            _isStaker[msg.sender] = true;
        }

        stakes[msg.sender].amount += netAmount;
        stakes[msg.sender].rewardDebt = accRewardPerToken;
        totalStaked += netAmount;

        _distributeCommission(commission);

        emit Staked(msg.sender, amount, netAmount, commission);
    }

    /**
     * @notice Retirar USG del stake. Se aplica comisión sobre el monto retirado.
     * @param amount Cantidad a retirar de la posición stakeada (antes de comisión).
     */
    function unstake(uint256 amount) external nonReentrant whenNotPaused nonZero(amount) {
        StakeInfo storage s = stakes[msg.sender];
        require(s.amount >= amount, "USG: insufficient stake");

        _updatePool();
        _settlePending(msg.sender);

        uint256 commission = (amount * commissionBps) / 10000;
        uint256 netAmount = amount - commission;

        s.amount -= amount;
        s.rewardDebt = accRewardPerToken;
        totalStaked -= amount;

        _distributeCommission(commission);

        USG.safeTransfer(msg.sender, netAmount);
        totalWithdrawn += netAmount;

        emit Unstaked(msg.sender, amount, netAmount, commission);
    }

    /**
     * @notice Reclamar recompensas acumuladas. Se aplica comisión del 5%.
     */
    function claim() external nonReentrant whenNotPaused {
        _updatePool();
        StakeInfo storage s = stakes[msg.sender];
        require(s.amount > 0, "USG: no stake");

        uint256 pending = (s.amount * (accRewardPerToken - s.rewardDebt)) / PRECISION;
        require(pending > 0, "USG: no rewards");

        s.rewardDebt = accRewardPerToken;

        uint256 commission = (pending * commissionBps) / 10000;
        uint256 netReward = pending - commission;

        _distributeCommission(commission);
        s.totalEarned += netReward;
        totalClaimed += netReward;

        USG.safeTransfer(msg.sender, netReward);
        emit RewardClaimed(msg.sender, pending, netReward, commission);
    }

    /**
     * @dev Liquida recompensas pendientes sin cambiar el balance (llamado antes de modificar stake).
     */
    function _settlePending(address user) internal {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0) return;
        uint256 pending = (s.amount * (accRewardPerToken - s.rewardDebt)) / PRECISION;
        if (pending > 0) {
            uint256 commission = (pending * commissionBps) / 10000;
            uint256 net = pending - commission;
            _distributeCommission(commission);
            s.totalEarned += net;
            totalClaimed += net;
            USG.safeTransfer(user, net);
            emit RewardClaimed(user, pending, net, commission);
        }
        s.rewardDebt = accRewardPerToken;
    }

    // ================================================================
    //  FONDEADO
    // ================================================================

    /**
     * @notice Fondear el pool de recompensas con Permit2. Cualquiera puede llamar.
     */
    function fund(
        uint256 amount,
        IPermit2.PermitTransferFrom calldata _permit,
        bytes calldata signature
    ) external nonReentrant nonZero(amount) {
        require(_permit.permitted.token == address(USG), "USG: wrong token");
        require(_permit.permitted.amount >= amount, "USG: permit amount too low");
        require(_permit.deadline >= block.timestamp, "USG: permit expired");

        permit2.permitTransferFrom(
            _permit,
            IPermit2.SignatureTransferDetails({to: address(this), requestedAmount: amount}),
            msg.sender,
            signature
        );

        _updatePool();
        rewardPool += amount;
        totalDeposited += amount;

        emit Funded(msg.sender, amount);
    }

    /**
     * @notice Fondear el pool directamente (requiere aprobación ERC20 previa). Cualquiera puede llamar.
     * @param amount Cantidad de USG a fondear.
     */
    function directFund(uint256 amount) external nonReentrant nonZero(amount) {
        USG.safeTransferFrom(msg.sender, address(this), amount);

        _updatePool();
        rewardPool += amount;
        totalDeposited += amount;

        emit DirectFunded(msg.sender, amount);
    }

    // ================================================================
    //  COMISIÓN DE OWNERS
    // ================================================================

    /**
     * @notice Los owners registrados pueden reclamar su parte de comisión acumulada.
     */
    function claimOwnerCommission() external nonReentrant {
        require(isOwner[msg.sender], "USG: not an owner");
        uint256 amount = ownerCommissionBalance[msg.sender];
        require(amount > 0, "USG: no commission");

        ownerCommissionBalance[msg.sender] = 0;
        ownerTotalClaimed[msg.sender] += amount;
        USG.safeTransfer(msg.sender, amount);
        emit OwnerCommissionClaimed(msg.sender, amount);
    }

    // ================================================================
    //  ADMIN — CONFIGURACIÓN DE COMISIÓN
    // ================================================================

    /**
     * @notice Establece la comisión. Solo owner1 o owner2.
     * @param newBps Nuevos BPS (max 2000 = 20%)
     */
    function setCommission(uint256 newBps) external onlyConfigOwner {
        require(newBps <= MAX_COMMISSION_BPS, "USG: exceeds max commission");
        emit CommissionUpdated(msg.sender, commissionBps, newBps);
        commissionBps = newBps;
    }

    // ================================================================
    //  ADMIN — GESTIÓN DE OWNERS
    // ================================================================

    function _addOwnerInternal(address addr) private {
        require(!isOwner[addr], "USG: already owner");
        require(addr != address(0), "USG: invalid address");
        require(_ownerList.length < MAX_OWNERS, "USG: max owners reached");
        _ownerList.push(addr);
        isOwner[addr] = true;
    }

    /**
     * @notice Agrega un nuevo owner. Máximo 100. Solo owner1 o owner2.
     */
    function addOwner(address newOwner) external onlyConfigOwner {
        _addOwnerInternal(newOwner);
        emit OwnerAdded(msg.sender, newOwner);
    }

    /**
     * @notice Elimina un owner. No se puede eliminar owner1 ni owner2. Solo owner1 o owner2.
     */
    function removeOwner(address target) external onlyConfigOwner {
        require(isOwner[target], "USG: not an owner");
        require(target != owner1 && target != owner2, "USG: cannot remove core owners");

        isOwner[target] = false;
        uint256 len = _ownerList.length;
        for (uint256 i = 0; i < len; ) {
            if (_ownerList[i] == target) {
                _ownerList[i] = _ownerList[len - 1];
                _ownerList.pop();
                break;
            }
            unchecked { i++; }
        }
        emit OwnerRemoved(msg.sender, target);
    }

    // ================================================================
    //  ADMIN — PAUSA
    // ================================================================

    function pause() external onlyConfigOwner {
        _pause();
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyConfigOwner {
        _unpause();
        emit ContractUnpaused(msg.sender);
    }

    // ================================================================
    //  ADMIN — RETIRO Y RECUPERACIÓN (solo owner1 y owner2)
    // ================================================================

    /**
     * @notice Retira USG del pool de recompensas. Solo owner1 o owner2.
     *         IMPORTANTE: reduce el APR activo; usar con precaución.
     * @param amount Cantidad a retirar del rewardPool.
     * @param to     Destinatario de los fondos.
     */
    function withdrawRewardPool(uint256 amount, address to) external onlyConfigOwner nonZero(amount) {
        require(to != address(0), "USG: invalid recipient");
        require(amount <= rewardPool, "USG: exceeds pool balance");

        _updatePool();
        rewardPool -= amount;
        totalPoolWithdrawn += amount;

        USG.safeTransfer(to, amount);
        emit PoolWithdrawn(msg.sender, amount, to);
    }

    /**
     * @notice Recupera cualquier ERC20 enviado por error (NO el token USG del staking).
     *         Solo owner1 o owner2.
     * @param token  Dirección del token a recuperar.
     * @param amount Cantidad a recuperar.
     */
    function recoverERC20(address token, uint256 amount) external onlyConfigOwner nonZero(amount) {
        require(token != address(0), "USG: invalid token");
        require(token != address(USG), "USG: use withdrawRewardPool for USG");
        IERC20(token).safeTransfer(msg.sender, amount);
        emit ERC20Recovered(token, amount, msg.sender);
    }

    /**
     * @notice Recupera ETH enviado por error al contrato. Solo owner1 o owner2.
     */
    function recoverETH() external onlyConfigOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "USG: no ETH balance");
        (bool ok,) = payable(msg.sender).call{value: bal}("");
        require(ok, "USG: ETH transfer failed");
        emit ETHRecovered(bal, msg.sender);
    }

    // ================================================================
    //  ADMIN — MANTENIMIENTO
    // ================================================================

    /**
     * @notice Elimina stakers inactivos (balance = 0 y sin recompensas pendientes).
     *         Optimiza las iteraciones futuras. Cualquier owner puede llamar.
     */
    function removeInactiveStakers() external {
        require(isOwner[msg.sender], "USG: not an owner");
        uint256 removed;
        uint256 i;
        while (i < _stakerList.length) {
            address staker = _stakerList[i];
            if (stakes[staker].amount == 0 && pendingReward(staker) == 0) {
                _isStaker[staker] = false;
                _stakerList[i] = _stakerList[_stakerList.length - 1];
                _stakerList.pop();
                unchecked { removed++; }
            } else {
                unchecked { i++; }
            }
        }
        emit InactiveStakersRemoved(removed);
    }

    // ================================================================
    //  FUNCIONES DE VISTA
    // ================================================================

    /// @notice Lista de todos los owners registrados
    function getOwners() external view returns (address[] memory) {
        return _ownerList;
    }

    /// @notice Cantidad de owners registrados
    function getOwnerCount() external view returns (uint256) {
        return _ownerList.length;
    }

    /// @notice Lista de todos los stakers (activos e inactivos hasta limpieza)
    function getStakers() external view returns (address[] memory) {
        return _stakerList;
    }

    /// @notice Cantidad de stakers registrados (incluye potencialmente inactivos)
    function getStakerCount() external view returns (uint256) {
        return _stakerList.length;
    }

    /// @notice Balance total de USG en el contrato (staked + rewardPool)
    function getContractBalance() external view returns (uint256) {
        return USG.balanceOf(address(this));
    }

    /**
     * @notice Información completa de un usuario.
     */
    function getUserInfo(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        uint256 totalEarned,
        uint256 tokenBalance,
        uint256 ownerCommission
    ) {
        stakedAmount     = stakes[user].amount;
        pendingRewards   = pendingReward(user);
        totalEarned      = stakes[user].totalEarned;
        tokenBalance     = USG.balanceOf(user);
        ownerCommission  = ownerCommissionBalance[user];
    }

    /**
     * @notice Estadísticas globales del pool.
     */
    function getPoolStats() external view returns (
        uint256 _totalStaked,
        uint256 _rewardPool,
        uint256 _currentAPR,
        uint256 _stakerCount,
        uint256 _ownerCount,
        uint256 _totalDeposited,
        uint256 _totalClaimed,
        uint256 _totalWithdrawn,
        uint256 _totalCommissionPool,
        uint256 _totalCommissionOwners,
        uint256 _totalGainedCommission,
        uint256 _commissionBps,
        bool    _paused,
        uint256 _totalPoolWithdrawn
    ) {
        _totalStaked            = totalStaked;
        _rewardPool             = rewardPool;
        _currentAPR             = currentAPR();
        _stakerCount            = _stakerList.length;
        _ownerCount             = _ownerList.length;
        _totalDeposited         = totalDeposited;
        _totalClaimed           = totalClaimed;
        _totalWithdrawn         = totalWithdrawn;
        _totalCommissionPool    = totalCommissionPool;
        _totalCommissionOwners  = totalCommissionOwners;
        _totalGainedCommission  = totalGainedCommission;
        _commissionBps          = commissionBps;
        _paused                 = paused();
        _totalPoolWithdrawn     = totalPoolWithdrawn;
    }
}
