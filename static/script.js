// Format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2
    }).format(value);
}

// Format percentage
function formatPercentage(value) {
    return value.toFixed(2) + '%';
}

// Update deposit amount
function updateDeposit(account, value) {
    const depositAmount = parseFloat(value) || 0;
    cashDeposits[account] = depositAmount;
    saveDeposits();

    // Trigger recalculation
    loadPortfolioData();
}

// Clear all deposits
function clearAllDeposits() {
    if (confirm('Clear all deposit simulations?')) {
        cashDeposits = {};
        saveDeposits();
        loadPortfolioData();
    }
}

// Load portfolio data
async function loadPortfolioData() {
    try {
        loadDeposits();
        const totalDeposits = Object.values(cashDeposits).reduce((sum, val) => sum + val, 0);

        // Always fetch base portfolio data (without deposits) for holdings table
        const baseResponse = await fetch('/api/portfolio');
        if (!baseResponse.ok) {
            throw new Error('Failed to load base portfolio data');
        }
        const baseData = await baseResponse.json();

        let data;

        // If we have deposits, use the special endpoint for rebalancing calculations
        if (totalDeposits > 0) {
            const response = await fetch('/api/portfolio-with-deposits', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({deposits: cashDeposits})
            });
            if (!response.ok) {
                throw new Error('Failed to load portfolio data with deposits');
            }
            data = await response.json();
        } else {
            // No deposits, use base data
            data = baseData;
        }

        // Render dashboard with rebalancing data, but pass base data for holdings table
        renderDashboard(data, baseData);
    } catch (error) {
        showError(error.message);
    }
}

// Show error message
function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = 'Error: ' + message;
    errorDiv.style.display = 'block';
}

// Render the complete dashboard
function renderDashboard(data, baseData) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    // Use baseData if provided (for holdings table without deposits), otherwise use data
    const holdingsData = baseData || data;

    // Render overview stats (use data which includes deposits to show current state)
    renderOverview(data);

    // Render cash balances (use baseData to show actual balances before deposits)
    renderCashBalances(holdingsData.cash_balances);

    // Render holdings table (use data which includes deposits to show current state)
    renderHoldingsTable(data);

    // Render account actions (use data which includes deposit simulations for rebalancing)
    renderAccountActions(data);

    // Render funding requirements (use data which includes deposit simulations)
    renderFundingRequirements(data.account_cash_needs);
}

// Render overview section
function renderOverview(data) {
    const totalInvested = data.total_value - data.total_cash;
    const cashPercentage = (data.total_cash / data.total_value * 100);
    const investedPercentage = (totalInvested / data.total_value * 100);
    const cashTarget = data.cash_target_percentage || 7.6;
    const cashDiff = cashPercentage - cashTarget;

    document.getElementById('total-value').textContent = formatCurrency(data.total_value);

    // Cash with target
    const cashTargetHTML = `
        <span class="stat-percentage editable-target" onclick="editCashTarget(this, ${cashTarget})" title="Click to edit target">
            ${formatPercentage(cashPercentage)}
            <span class="target-label">(Target: ${formatPercentage(cashTarget)})</span>
            ${Math.abs(cashDiff) > 0.1 ? `<span class="diff ${cashDiff > 0 ? 'over' : 'under'}">${cashDiff > 0 ? '+' : ''}${formatPercentage(cashDiff)}</span>` : ''}
        </span>
    `;
    document.getElementById('total-cash').innerHTML = `${formatCurrency(data.total_cash)}${cashTargetHTML}`;

    document.getElementById('total-invested').innerHTML = `${formatCurrency(totalInvested)}<span class="stat-percentage">${formatPercentage(investedPercentage)}</span>`;
    document.getElementById('total-holdings').textContent = data.holdings.length;
}

// Store for deposit simulations
let cashDeposits = {};

// Load deposits from localStorage
function loadDeposits() {
    const stored = localStorage.getItem('cashDeposits');
    if (stored) {
        cashDeposits = JSON.parse(stored);
    }
}

// Save deposits to localStorage
function saveDeposits() {
    localStorage.setItem('cashDeposits', JSON.stringify(cashDeposits));
}

// Render cash balances by account
function renderCashBalances(cashBalances) {
    const container = document.getElementById('cash-balances');
    container.innerHTML = '';

    loadDeposits();

    const sortedAccounts = Object.entries(cashBalances).sort((a, b) => a[0].localeCompare(b[0]));

    sortedAccounts.forEach(([account, balance]) => {
        const deposit = cashDeposits[account] || 0;
        const total = balance + deposit;

        const accountBox = document.createElement('div');
        accountBox.className = 'account-box';
        accountBox.innerHTML = `
            <div class="account-name">${account}</div>
            <div class="account-cash editable-cash" onclick="editCashBalance(this, '${account}')" title="Click to edit actual balance">
                <span class="cash-label">Current:</span> ${formatCurrency(balance)}
            </div>
            <div class="deposit-field">
                <label class="deposit-label">+ Deposit:</label>
                <input type="number"
                       class="deposit-input"
                       step="100"
                       value="${deposit}"
                       onchange="updateDeposit('${account}', this.value)"
                       placeholder="0">
            </div>
            <div class="total-cash">
                <span class="cash-label">Total:</span> <strong>${formatCurrency(total)}</strong>
            </div>
        `;
        container.appendChild(accountBox);
    });
}

// Render rebalancing recommendations
function renderRecommendations(adjustments) {
    const container = document.getElementById('recommendations-list');

    if (adjustments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #4caf50; padding: 20px; font-size: 1.2em;">Portfolio is well balanced! No significant adjustments needed.</p>';
        return;
    }

    container.innerHTML = '';

    adjustments.forEach(adj => {
        const rec = document.createElement('div');
        rec.className = `recommendation ${adj.action.toLowerCase()}`;

        const adjValue = Math.abs(adj.adjustment_value);
        const adjPct = adj.adjustment_pct;

        rec.innerHTML = `
            <div class="rec-header">
                <span class="rec-action ${adj.action.toLowerCase()}">${adj.action}</span>
                <span class="rec-ticker">${adj.ticker}</span>
                <span class="rec-name">${adj.name}</span>
            </div>
            <div class="rec-details">
                <div class="rec-detail">
                    <span class="rec-detail-label">Current Value:</span>
                    <span class="rec-detail-value">${formatCurrency(adj.current_value)}</span>
                </div>
                <div class="rec-detail">
                    <span class="rec-detail-label">Target Value:</span>
                    <span class="rec-detail-value">${formatCurrency(adj.target_value)}</span>
                </div>
                <div class="rec-detail">
                    <span class="rec-detail-label">Current Weight:</span>
                    <span class="rec-detail-value">${formatPercentage(adj.current_weight)}</span>
                </div>
                <div class="rec-detail">
                    <span class="rec-detail-label">Target Weight:</span>
                    <span class="rec-detail-value">${formatPercentage(adj.target_weight)}</span>
                </div>
            </div>
            <div class="rec-adjustment ${adjPct > 0 ? 'negative' : 'positive'}">
                Adjustment: ${formatCurrency(adj.adjustment_value)} (${adjPct > 0 ? '+' : ''}${formatPercentage(adjPct)})
            </div>
            <div class="rec-accounts">
                Held in: ${adj.held_in_accounts.join(', ')}
            </div>
        `;

        container.appendChild(rec);
    });
}

// Render account actions
function renderAccountActions(data) {
    const container = document.getElementById('account-actions');
    container.innerHTML = '';

    // Create a map of adjustments by ticker for easy lookup
    const adjustmentsByTicker = {};
    data.adjustments.forEach(adj => {
        adjustmentsByTicker[adj.ticker] = adj;
    });

    const accounts = Object.keys(data.account_actions).sort();

    // Show message if no actions needed
    if (accounts.length === 0 || accounts.every(acc => data.account_actions[acc].length === 0)) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #4caf50; font-size: 1.2em;">✓ Portfolio is well balanced! No rebalancing actions needed.</div>';
        return;
    }

    accounts.forEach(account => {
        const actions = data.account_actions[account];
        if (actions.length === 0) return;

        const accountCard = document.createElement('div');
        accountCard.className = 'account-action-card';

        const buys = actions.filter(a => a.action === 'BUY');
        const sells = actions.filter(a => a.action === 'SELL');

        const totalBuys = buys.reduce((sum, a) => sum + a.value, 0);
        const totalSells = sells.reduce((sum, a) => sum + Math.abs(a.value), 0);
        const currentCash = data.cash_balances[account] || 0;
        const netCash = currentCash + totalSells - totalBuys;
        const cashVariance = netCash - currentCash;

        let html = `
            <div class="account-title">${account}</div>
            <div class="current-cash">Current Cash: ${formatCurrency(currentCash)}</div>
        `;

        if (sells.length > 0) {
            html += '<div class="actions-group"><h4>Sell (Reduce Weight)</h4>';
            sells.forEach(action => {
                const adj = adjustmentsByTicker[action.ticker];
                html += `
                    <div class="action-item sell">
                        <div class="action-info">
                            <div class="action-header">
                                <span class="action-type sell">SELL</span>
                                <strong>${action.ticker}</strong> - ${action.name}
                            </div>
                            ${adj ? `<div class="action-weights">
                                <span class="weight-info">Current: ${formatPercentage(adj.current_weight)}</span>
                                <span class="weight-arrow">→</span>
                                <span class="weight-info target">Target: ${formatPercentage(adj.target_weight)}</span>
                            </div>` : ''}
                        </div>
                        <div class="action-value sell">${formatCurrency(Math.abs(action.value))}</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        if (buys.length > 0) {
            html += '<div class="actions-group"><h4>Buy (Increase Weight)</h4>';
            buys.forEach(action => {
                const adj = adjustmentsByTicker[action.ticker];
                html += `
                    <div class="action-item buy">
                        <div class="action-info">
                            <div class="action-header">
                                <span class="action-type buy">BUY</span>
                                <strong>${action.ticker}</strong> - ${action.name}
                            </div>
                            ${adj ? `<div class="action-weights">
                                <span class="weight-info">Current: ${formatPercentage(adj.current_weight)}</span>
                                <span class="weight-arrow">→</span>
                                <span class="weight-info target">Target: ${formatPercentage(adj.target_weight)}</span>
                            </div>` : ''}
                        </div>
                        <div class="action-value buy">${formatCurrency(action.value)}</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        html += `
            <div class="net-cash ${netCash >= 0 ? 'positive' : 'negative'}">
                Net cash after trades: ${formatCurrency(netCash)}
                <span class="cash-variance ${cashVariance >= 0 ? 'positive' : 'negative'}">
                    (${cashVariance >= 0 ? '+' : ''}${formatCurrency(cashVariance)})
                </span>
            </div>
        `;

        accountCard.innerHTML = html;
        container.appendChild(accountCard);
    });
}

// Render funding requirements
function renderFundingRequirements(cashNeeds) {
    const container = document.getElementById('funding-requirements');
    const card = document.getElementById('funding-card');

    if (Object.keys(cashNeeds).length === 0) {
        container.innerHTML = '<div class="funding-success">All accounts have sufficient cash for rebalancing!</div>';
        card.style.background = '#e8f5e9';
        return;
    }

    container.innerHTML = '<p style="margin-bottom: 15px; color: #666;">The following accounts need additional funding:</p>';

    Object.entries(cashNeeds).sort((a, b) => b[1] - a[1]).forEach(([account, need]) => {
        const fundingItem = document.createElement('div');
        fundingItem.className = 'funding-item';
        fundingItem.innerHTML = `
            <div class="funding-account">${account}</div>
            <div class="funding-amount">${formatCurrency(need)}</div>
        `;
        container.appendChild(fundingItem);
    });

    card.style.background = '#fff8e1';
}

// Global state for filtering and sorting
let currentFilter = 'all';
let currentSort = { column: null, direction: 'asc' };
let holdingsData = null;

// Render holdings table
function renderHoldingsTable(data) {
    const tbody = document.getElementById('holdings-tbody');
    tbody.innerHTML = '';

    // Store data globally for filtering/sorting
    holdingsData = data;

    // Populate account filter dropdown
    populateAccountFilter(data.holdings);

    const holdings = data.holdings;

    // Group holdings by ticker
    const holdingsByTicker = {};
    holdings.forEach(holding => {
        if (!holdingsByTicker[holding.ticker]) {
            holdingsByTicker[holding.ticker] = [];
        }
        holdingsByTicker[holding.ticker].push(holding);
    });

    let totalValue = 0;
    let totalCurrentWeight = 0;
    let totalTargetWeight = 0;

    // Sort tickers alphabetically
    const sortedTickers = Object.keys(holdingsByTicker).sort();

    sortedTickers.forEach(ticker => {
        const tickerHoldings = holdingsByTicker[ticker];

        // Calculate totals for this ticker across all accounts
        const tickerTotalValue = tickerHoldings.reduce((sum, h) => sum + h.current_value, 0);
        const tickerCurrentWeight = tickerHoldings.reduce((sum, h) => sum + h.current_weight, 0);
        const tickerTargetWeight = Math.max(...tickerHoldings.map(h => h.target_weight));

        totalValue += tickerTotalValue;
        totalCurrentWeight += tickerCurrentWeight;
        totalTargetWeight += tickerTargetWeight;

        const tickerId = `ticker-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;
        const isExpanded = false;

        // Master row
        const masterRow = document.createElement('tr');
        masterRow.className = 'master-row';

        // Determine first column content - show account for single holdings, expand icon for multiple
        let firstColumnContent;
        if (tickerHoldings.length > 1) {
            firstColumnContent = `<span class="expand-icon" onclick="toggleAccounts('${tickerId}')" style="cursor: pointer;">▶ Multiple</span>`;
        } else {
            const ownerName = tickerHoldings[0].owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
            const fullAccount = `${ownerName} ${tickerHoldings[0].account}`;
            firstColumnContent = `<span class="account-badge">${fullAccount}</span>`;
        }

        masterRow.innerHTML = `
            <td>${firstColumnContent}</td>
            <td><strong>${ticker}</strong></td>
            <td>${tickerHoldings[0].name}</td>
            <td class="editable" onclick="editTickerValue(this, '${ticker}')" title="Click to edit value">${formatCurrency(tickerTotalValue)}</td>
            <td>${formatPercentage(tickerCurrentWeight)}</td>
            <td class="editable" onclick="editTickerTarget(this, '${ticker}')" title="Click to edit target">${formatPercentage(tickerTargetWeight)}</td>
            <td>
                ${tickerHoldings.length === 1 ? `<button class="btn btn-danger" onclick="deleteHolding('${ticker}', '${tickerHoldings[0].account}', '${tickerHoldings[0].owner}', '${tickerHoldings[0].name}')">Delete</button>` : ''}
            </td>
        `;
        tbody.appendChild(masterRow);

        // Account detail rows (initially hidden)
        if (tickerHoldings.length > 1) {
            tickerHoldings.forEach(holding => {
                const ownerName = holding.owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
                const fullAccount = `${ownerName} ${holding.account}`;

                const detailRow = document.createElement('tr');
                detailRow.className = `detail-row ${tickerId}`;
                detailRow.style.display = 'none';
                detailRow.innerHTML = `
                    <td></td>
                    <td colspan="2" style="padding-left: 40px;"><span class="account-badge">${fullAccount}</span></td>
                    <td class="editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'current_value')" title="Click to edit value">${formatCurrency(holding.current_value)}</td>
                    <td>${formatPercentage(holding.current_weight)}</td>
                    <td class="editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'target_weight')" title="Click to edit target">${formatPercentage(holding.target_weight)}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deleteHolding('${holding.ticker}', '${holding.account}', '${holding.owner}', '${holding.name}')">Delete</button>
                    </td>
                `;
                tbody.appendChild(detailRow);
            });
        }
    });

    // Add cash row
    const cashPercentage = (data.total_cash / data.total_value * 100);
    const cashTarget = data.cash_target_percentage || 7.6;

    const cashRow = document.createElement('tr');
    cashRow.className = 'cash-row';
    cashRow.innerHTML = `
        <td colspan="3" style="text-align: right;"><strong>CASH:</strong></td>
        <td><strong>${formatCurrency(data.total_cash)}</strong></td>
        <td><strong>${formatPercentage(cashPercentage)}</strong></td>
        <td><strong>${formatPercentage(cashTarget)}</strong></td>
        <td></td>
    `;
    tbody.appendChild(cashRow);

    // Add totals row (including cash)
    const grandTotalValue = totalValue + data.total_cash;
    const grandTotalCurrent = totalCurrentWeight + cashPercentage;
    const grandTotalTarget = totalTargetWeight + cashTarget;

    const totalsRow = document.createElement('tr');
    totalsRow.className = 'totals-row';
    totalsRow.innerHTML = `
        <td colspan="3" style="text-align: right;"><strong>GRAND TOTAL:</strong></td>
        <td><strong>${formatCurrency(grandTotalValue)}</strong></td>
        <td><strong>${formatPercentage(grandTotalCurrent)}</strong></td>
        <td><strong>${formatPercentage(grandTotalTarget)}</strong></td>
        <td></td>
    `;
    tbody.appendChild(totalsRow);
}

// Toggle account details for a ticker
function toggleAccounts(tickerId) {
    const detailRows = document.querySelectorAll(`.${tickerId}`);
    const expandIcon = event.target;

    detailRows.forEach(row => {
        if (row.style.display === 'none') {
            row.style.display = '';
            expandIcon.textContent = '▼';
        } else {
            row.style.display = 'none';
            expandIcon.textContent = '▶';
        }
    });
}

// Edit ticker total value (proportionally updates all accounts)
async function editTickerValue(cell, ticker) {
    if (editingCell) return;

    editingCell = cell;
    const currentValue = cell.textContent.replace(/[£,]/g, '').trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentValue;
    input.style.width = '100%';

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue)) {
            alert('Invalid number');
            cell.textContent = formatCurrency(parseFloat(currentValue));
            editingCell = null;
            return;
        }

        try {
            const response = await fetch('/api/holdings/update-ticker-value', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, new_value: newValue})
            });

            if (response.ok) {
                await loadPortfolioData();
            } else {
                alert('Failed to update value');
                cell.textContent = formatCurrency(parseFloat(currentValue));
            }
        } catch (error) {
            alert('Error: ' + error.message);
            cell.textContent = formatCurrency(parseFloat(currentValue));
        }
        editingCell = null;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            cell.textContent = formatCurrency(parseFloat(currentValue));
            editingCell = null;
        }
    });
}

// Edit ticker target weight (updates all accounts)
async function editTickerTarget(cell, ticker) {
    if (editingCell) return;

    editingCell = cell;
    const currentValue = cell.textContent.replace(/[%]/g, '').trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentValue;
    input.style.width = '100%';

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue)) {
            alert('Invalid number');
            cell.textContent = formatPercentage(parseFloat(currentValue));
            editingCell = null;
            return;
        }

        try {
            const response = await fetch('/api/holdings/update-ticker-target', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, new_target: newValue})
            });

            if (response.ok) {
                await loadPortfolioData();
            } else {
                alert('Failed to update target');
                cell.textContent = formatPercentage(parseFloat(currentValue));
            }
        } catch (error) {
            alert('Error: ' + error.message);
            cell.textContent = formatPercentage(parseFloat(currentValue));
        }
        editingCell = null;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            cell.textContent = formatPercentage(parseFloat(currentValue));
            editingCell = null;
        }
    });
}

// Edit cell inline
let editingCell = null;
function editCell(cell, ticker, account, owner, field) {
    if (editingCell) return; // Already editing another cell

    editingCell = cell;
    const currentValue = cell.textContent.replace(/[£,%]/g, '').replace(/,/g, '').trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentValue;
    input.style.width = '100%';

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue)) {
            alert('Invalid number');
            cell.textContent = currentValue;
            editingCell = null;
            return;
        }

        const updates = {};
        updates[field] = newValue;

        try {
            const response = await fetch('/api/holdings/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, account, owner, updates})
            });

            if (response.ok) {
                await loadPortfolioData(); // Reload entire dashboard
            } else {
                alert('Failed to update holding');
                if (field === 'current_value') {
                    cell.textContent = formatCurrency(parseFloat(currentValue));
                } else if (field === 'target_weight') {
                    cell.textContent = formatPercentage(parseFloat(currentValue));
                } else {
                    cell.textContent = currentValue;
                }
            }
        } catch (error) {
            alert('Error: ' + error.message);
            if (field === 'current_value') {
                cell.textContent = formatCurrency(parseFloat(currentValue));
            } else if (field === 'target_weight') {
                cell.textContent = formatPercentage(parseFloat(currentValue));
            } else {
                cell.textContent = currentValue;
            }
        }
        editingCell = null;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            if (field === 'current_value') {
                cell.textContent = formatCurrency(parseFloat(currentValue));
            } else if (field === 'target_weight') {
                cell.textContent = formatPercentage(parseFloat(currentValue));
            } else {
                cell.textContent = currentValue;
            }
            editingCell = null;
        }
    });
}

// Edit cash balance
let editingCash = null;
async function editCashBalance(element, account) {
    if (editingCash) return; // Already editing another cash balance

    editingCash = element;
    const currentValue = element.textContent.replace(/[£,]/g, '').trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentValue;
    input.style.fontSize = '1.5em';
    input.style.fontWeight = '700';
    input.style.color = '#667eea';
    input.style.border = '2px solid #667eea';
    input.style.borderRadius = '5px';
    input.style.padding = '5px';
    input.style.width = '100%';

    element.textContent = '';
    element.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue) || newValue < 0) {
            alert('Invalid amount');
            element.textContent = formatCurrency(parseFloat(currentValue));
            editingCash = null;
            return;
        }

        try {
            const response = await fetch('/api/cash/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({account, amount: newValue})
            });

            if (response.ok) {
                await loadPortfolioData(); // Reload entire dashboard
            } else {
                alert('Failed to update cash balance');
                element.textContent = formatCurrency(parseFloat(currentValue));
            }
        } catch (error) {
            alert('Error: ' + error.message);
            element.textContent = formatCurrency(parseFloat(currentValue));
        }
        editingCash = null;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            element.textContent = formatCurrency(parseFloat(currentValue));
            editingCash = null;
        }
    });
}

// Delete holding
async function deleteHolding(ticker, account, owner, name) {
    if (!confirm(`Are you sure you want to delete ${name} (${ticker})?`)) {
        return;
    }

    try {
        const response = await fetch('/api/holdings/delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ticker, account, owner})
        });

        if (response.ok) {
            await loadPortfolioData();
        } else {
            alert('Failed to delete holding');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Show add holding modal
function showAddHoldingModal() {
    document.getElementById('modal-title').textContent = 'Add Holding';
    document.getElementById('holding-form').reset();
    document.getElementById('holding-modal').style.display = 'block';
}

// Close modal
function closeModal() {
    document.getElementById('holding-modal').style.display = 'none';
}

// Save holding (add or update)
async function saveHolding(event) {
    event.preventDefault();

    const value = parseFloat(document.getElementById('form-value').value);
    const targetWeight = parseFloat(document.getElementById('form-target-weight').value) || 0;

    const holdingData = {
        owner: document.getElementById('form-owner').value,
        account: document.getElementById('form-account').value,
        asset_type: 'EQ',  // Default to Equity
        ticker: document.getElementById('form-ticker').value,
        name: document.getElementById('form-name').value,
        quantity: 1,  // Default quantity
        last_price: value,  // Set price equal to value
        book_cost: value,  // Set book cost equal to value
        target_weight: targetWeight
    };

    try {
        const response = await fetch('/api/holdings/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(holdingData)
        });

        if (response.ok) {
            closeModal();
            await loadPortfolioData();
        } else {
            alert('Failed to add holding');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Edit cash target
let editingCashTarget = null;
async function editCashTarget(element, currentTarget) {
    if (editingCashTarget) return;

    editingCashTarget = element;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.value = currentTarget;
    input.style.width = '80px';
    input.style.fontSize = '0.9em';
    input.style.padding = '3px';
    input.style.border = '2px solid white';
    input.style.borderRadius = '3px';
    input.style.background = 'rgba(255,255,255,0.2)';
    input.style.color = 'white';

    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newValue = parseFloat(input.value);
        if (isNaN(newValue) || newValue < 0 || newValue > 100) {
            alert('Invalid percentage (must be between 0 and 100)');
            editingCashTarget = null;
            await loadPortfolioData();
            return;
        }

        try {
            const response = await fetch('/api/cash-target/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({target_percentage: newValue})
            });

            if (response.ok) {
                await loadPortfolioData();
            } else {
                alert('Failed to update cash target');
                await loadPortfolioData();
            }
        } catch (error) {
            alert('Error: ' + error.message);
            await loadPortfolioData();
        }
        editingCashTarget = null;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            editingCashTarget = null;
            loadPortfolioData();
        }
    });
}

// Handle CSV file upload
async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (!file.name.endsWith('.csv')) {
        alert('Please select a CSV file');
        event.target.value = '';
        return;
    }

    if (!confirm('This will overwrite your current portfolio data with data from the uploaded CSV file. Continue?')) {
        event.target.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/import-csv', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            alert(`Portfolio data imported successfully!\n\nImported:\n- ${result.holdings_count} holdings\n- ${result.accounts_count} accounts with cash balances`);
            await loadPortfolioData();
        } else {
            alert('Failed to import CSV data: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        // Clear the file input so the same file can be uploaded again
        event.target.value = '';
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('holding-modal');
    if (event.target === modal) {
        closeModal();
    }
};

// Populate account filter dropdown
function populateAccountFilter(holdings) {
    const accountFilter = document.getElementById('account-filter');
    const currentValue = accountFilter.value;

    // Get unique accounts
    const accounts = new Set();
    holdings.forEach(holding => {
        const ownerName = holding.owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
        const fullAccount = `${ownerName} ${holding.account}`;
        accounts.add(fullAccount);
    });

    // Sort accounts
    const sortedAccounts = Array.from(accounts).sort();

    // Rebuild dropdown
    accountFilter.innerHTML = '<option value="all">All Accounts</option>';
    sortedAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.textContent = account;
        accountFilter.appendChild(option);
    });

    // Restore previous selection if it exists
    if (currentValue && Array.from(accountFilter.options).some(opt => opt.value === currentValue)) {
        accountFilter.value = currentValue;
    }
}

// Apply filters and sorting
function applyFiltersAndSort() {
    if (!holdingsData) return;

    currentFilter = document.getElementById('account-filter').value;

    // Filter holdings
    let filteredHoldings = holdingsData.holdings;
    if (currentFilter !== 'all') {
        filteredHoldings = filteredHoldings.filter(holding => {
            const ownerName = holding.owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
            const fullAccount = `${ownerName} ${holding.account}`;
            return fullAccount === currentFilter;
        });
    }

    // Group by ticker
    const holdingsByTicker = {};
    filteredHoldings.forEach(holding => {
        if (!holdingsByTicker[holding.ticker]) {
            holdingsByTicker[holding.ticker] = [];
        }
        holdingsByTicker[holding.ticker].push(holding);
    });

    // Calculate ticker totals
    let tickerTotals = Object.keys(holdingsByTicker).map(ticker => {
        const tickerHoldings = holdingsByTicker[ticker];
        const tickerTotalValue = tickerHoldings.reduce((sum, h) => sum + h.current_value, 0);
        const tickerCurrentWeight = tickerHoldings.reduce((sum, h) => sum + h.current_weight, 0);
        const tickerTargetWeight = Math.max(...tickerHoldings.map(h => h.target_weight));

        return {
            ticker,
            holdings: tickerHoldings,
            totalValue: tickerTotalValue,
            currentWeight: tickerCurrentWeight,
            targetWeight: tickerTargetWeight,
            name: tickerHoldings[0].name
        };
    });

    // Apply sorting
    if (currentSort.column) {
        tickerTotals.sort((a, b) => {
            let aVal, bVal;

            switch(currentSort.column) {
                case 'value':
                    aVal = a.totalValue;
                    bVal = b.totalValue;
                    break;
                case 'current':
                    aVal = a.currentWeight;
                    bVal = b.currentWeight;
                    break;
                case 'target':
                    aVal = a.targetWeight;
                    bVal = b.targetWeight;
                    break;
                default:
                    return 0;
            }

            if (currentSort.direction === 'asc') {
                return aVal - bVal;
            } else {
                return bVal - aVal;
            }
        });
    } else {
        // Default: sort by ticker alphabetically
        tickerTotals.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    // Update sort indicators
    updateSortIndicators();

    // Render the filtered and sorted table
    renderFilteredTable(tickerTotals, holdingsData);
}

// Update sort indicators
function updateSortIndicators() {
    // Clear all indicators
    ['value', 'current', 'target'].forEach(col => {
        const indicator = document.getElementById(`sort-${col}`);
        if (indicator) {
            indicator.textContent = '';
        }
    });

    // Set current indicator
    if (currentSort.column) {
        const indicator = document.getElementById(`sort-${currentSort.column}`);
        if (indicator) {
            indicator.textContent = currentSort.direction === 'asc' ? '▲' : '▼';
        }
    }
}

// Sort table by column
function sortTable(column) {
    if (currentSort.column === column) {
        // Toggle direction
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to descending for value/percentages
        currentSort.column = column;
        currentSort.direction = 'desc';
    }

    applyFiltersAndSort();
}

// Reset filters and sorting
function resetFiltersAndSort() {
    currentFilter = 'all';
    currentSort = { column: null, direction: 'asc' };
    document.getElementById('account-filter').value = 'all';
    updateSortIndicators();

    if (holdingsData) {
        renderHoldingsTable(holdingsData);
    }
}

// Render filtered table
function renderFilteredTable(tickerTotals, data) {
    const tbody = document.getElementById('holdings-tbody');
    tbody.innerHTML = '';

    let totalValue = 0;
    let totalCurrentWeight = 0;
    let totalTargetWeight = 0;

    tickerTotals.forEach(tickerData => {
        const ticker = tickerData.ticker;
        const tickerHoldings = tickerData.holdings;
        const tickerTotalValue = tickerData.totalValue;
        const tickerCurrentWeight = tickerData.currentWeight;
        const tickerTargetWeight = tickerData.targetWeight;

        totalValue += tickerTotalValue;
        totalCurrentWeight += tickerCurrentWeight;
        totalTargetWeight += tickerTargetWeight;

        const tickerId = `ticker-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;

        // Master row
        const masterRow = document.createElement('tr');
        masterRow.className = 'master-row';

        // Determine first column content
        let firstColumnContent;
        if (tickerHoldings.length > 1) {
            firstColumnContent = `<span class="expand-icon" onclick="toggleAccounts('${tickerId}')" style="cursor: pointer;">▶ Multiple</span>`;
        } else {
            const ownerName = tickerHoldings[0].owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
            const fullAccount = `${ownerName} ${tickerHoldings[0].account}`;
            firstColumnContent = `<span class="account-badge">${fullAccount}</span>`;
        }

        masterRow.innerHTML = `
            <td>${firstColumnContent}</td>
            <td><strong>${ticker}</strong></td>
            <td>${tickerHoldings[0].name}</td>
            <td class="editable" onclick="editTickerValue(this, '${ticker}')" title="Click to edit value">${formatCurrency(tickerTotalValue)}</td>
            <td>${formatPercentage(tickerCurrentWeight)}</td>
            <td class="editable" onclick="editTickerTarget(this, '${ticker}')" title="Click to edit target">${formatPercentage(tickerTargetWeight)}</td>
            <td>
                ${tickerHoldings.length === 1 ? `<button class="btn btn-danger" onclick="deleteHolding('${ticker}', '${tickerHoldings[0].account}', '${tickerHoldings[0].owner}', '${tickerHoldings[0].name}')">Delete</button>` : ''}
            </td>
        `;
        tbody.appendChild(masterRow);

        // Account detail rows (initially hidden)
        if (tickerHoldings.length > 1) {
            tickerHoldings.forEach(holding => {
                const ownerName = holding.owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
                const fullAccount = `${ownerName} ${holding.account}`;

                const detailRow = document.createElement('tr');
                detailRow.className = `detail-row ${tickerId}`;
                detailRow.style.display = 'none';
                detailRow.innerHTML = `
                    <td></td>
                    <td colspan="2" style="padding-left: 40px;"><span class="account-badge">${fullAccount}</span></td>
                    <td class="editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'current_value')" title="Click to edit value">${formatCurrency(holding.current_value)}</td>
                    <td>${formatPercentage(holding.current_weight)}</td>
                    <td class="editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'target_weight')" title="Click to edit target">${formatPercentage(holding.target_weight)}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deleteHolding('${holding.ticker}', '${holding.account}', '${holding.owner}', '${holding.name}')">Delete</button>
                    </td>
                `;
                tbody.appendChild(detailRow);
            });
        }
    });

    // Add cash row
    const cashPercentage = (data.total_cash / data.total_value * 100);
    const cashTarget = data.cash_target_percentage || 7.6;

    const cashRow = document.createElement('tr');
    cashRow.className = 'cash-row';
    cashRow.innerHTML = `
        <td colspan="3" style="text-align: right;"><strong>CASH:</strong></td>
        <td><strong>${formatCurrency(data.total_cash)}</strong></td>
        <td><strong>${formatPercentage(cashPercentage)}</strong></td>
        <td><strong>${formatPercentage(cashTarget)}</strong></td>
        <td></td>
    `;
    tbody.appendChild(cashRow);

    // Add totals row (including cash)
    const grandTotalValue = totalValue + data.total_cash;
    const grandTotalCurrent = totalCurrentWeight + cashPercentage;
    const grandTotalTarget = totalTargetWeight + cashTarget;

    const totalsRow = document.createElement('tr');
    totalsRow.className = 'totals-row';
    totalsRow.innerHTML = `
        <td colspan="3" style="text-align: right;"><strong>GRAND TOTAL:</strong></td>
        <td><strong>${formatCurrency(grandTotalValue)}</strong></td>
        <td><strong>${formatPercentage(grandTotalCurrent)}</strong></td>
        <td><strong>${formatPercentage(grandTotalTarget)}</strong></td>
        <td></td>
    `;
    tbody.appendChild(totalsRow);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadPortfolioData();
});
