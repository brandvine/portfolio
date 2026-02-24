// Format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2
    }).format(value);
}

// Format price (more decimal places for per-unit prices)
function formatPrice(value) {
    if (value >= 100) {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            minimumFractionDigits: 2
        }).format(value);
    }
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    }).format(value);
}

// Format percentage
function formatPercentage(value) {
    return value.toFixed(2) + '%';
}

// Format quantity
function formatQuantity(value) {
    return new Intl.NumberFormat('en-GB', {
        maximumFractionDigits: 0
    }).format(value);
}

// Format P/L with color
function formatPL(value) {
    const formatted = (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
    return formatted;
}

// Get asset type label
function getAssetTypeLabel(type) {
    const labels = {
        'EQ': 'Equities',
        'MA': 'Multi Asset',
        'FI': 'Fixed Income',
        'AA': 'Alternatives'
    };
    return labels[type] || type;
}

// Get asset type badge class
function getAssetTypeBadgeClass(type) {
    const classes = {
        'EQ': 'badge-eq',
        'MA': 'badge-ma',
        'FI': 'badge-fi',
        'AA': 'badge-aa'
    };
    return classes[type] || '';
}

// Update deposit amount
function updateDeposit(account, value) {
    const depositAmount = parseFloat(value) || 0;
    cashDeposits[account] = depositAmount;
    saveDeposits();
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

// Price source cache
let priceSources = {};

// Load portfolio data
async function loadPortfolioData() {
    try {
        loadDeposits();
        const totalDeposits = Object.values(cashDeposits).reduce((sum, val) => sum + val, 0);

        // Fetch portfolio data and price sources in parallel
        const [baseResponse, sourcesResponse] = await Promise.all([
            fetch('/api/portfolio'),
            fetch('/api/price-sources')
        ]);

        if (!baseResponse.ok) {
            throw new Error('Failed to load base portfolio data');
        }
        const baseData = await baseResponse.json();

        if (sourcesResponse.ok) {
            priceSources = await sourcesResponse.json();
        }

        let data;

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
            data = baseData;
        }

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

    const holdingsData = baseData || data;

    renderOverview(data);
    renderCashBalances(holdingsData.cash_balances);
    renderHoldingsTable(data);
    renderAccountActions(data);
    renderFundingRequirements(data.account_cash_needs);
}

// Render overview section
function renderOverview(data) {
    const totalInvested = data.total_value - data.total_cash;
    const cashPercentage = (data.total_cash / data.total_value * 100);
    const cashTarget = data.cash_target_percentage || 7.6;
    const cashDiff = cashPercentage - cashTarget;

    // Calculate total P/L
    let totalBookCost = 0;
    let totalCurrentValue = 0;
    data.holdings.forEach(h => {
        totalBookCost += h.book_cost || 0;
        totalCurrentValue += h.current_value || 0;
    });
    const totalPL = totalCurrentValue - totalBookCost;
    const totalPLPct = totalBookCost > 0 ? (totalPL / totalBookCost * 100) : 0;

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

    const investedPercentage = (totalInvested / data.total_value * 100);
    document.getElementById('total-invested').innerHTML = `${formatCurrency(totalInvested)}<span class="stat-percentage">${formatPercentage(investedPercentage)}</span>`;

    // P/L display
    const plClass = totalPL >= 0 ? 'pl-positive' : 'pl-negative';
    document.getElementById('total-pl').innerHTML = `
        <span class="${plClass}">${formatCurrency(totalPL)}</span>
        <span class="stat-percentage ${plClass}">${totalPL >= 0 ? '+' : ''}${formatPercentage(totalPLPct)}</span>
    `;
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
            <div class="cash-balance-field">
                <label class="cash-field-label">Balance:</label>
                <input type="number"
                       class="cash-balance-input"
                       step="0.01"
                       value="${balance}"
                       onchange="saveCashBalance('${account}', this.value)"
                       onblur="saveCashBalance('${account}', this.value)">
            </div>
            <div class="deposit-field">
                <label class="deposit-label">+ Simulate Deposit:</label>
                <input type="number"
                       class="deposit-input"
                       step="100"
                       value="${deposit}"
                       onchange="updateDeposit('${account}', this.value)"
                       placeholder="0">
            </div>
            ${deposit > 0 ? `<div class="total-cash">
                <span class="cash-label">Total:</span> <strong>${formatCurrency(total)}</strong>
            </div>` : ''}
        `;
        container.appendChild(accountBox);
    });
}

// Refresh prices from Yahoo Finance
async function refreshPrices() {
    const btn = document.getElementById('refresh-btn');
    const statusEl = document.getElementById('price-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="refresh-icon spinning">&#8635;</span> Fetching...';
    statusEl.textContent = '';

    try {
        const response = await fetch('/api/refresh-prices', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });

        const result = await response.json();

        if (response.ok) {
            statusEl.textContent = `Updated ${result.updated} prices`;
            statusEl.className = 'price-status price-status-success';
            await loadPortfolioData();

            // Clear status after 5 seconds
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'price-status';
            }, 5000);
        } else {
            statusEl.textContent = 'Failed to refresh';
            statusEl.className = 'price-status price-status-error';
        }
    } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.className = 'price-status price-status-error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="refresh-icon">&#8635;</span> Refresh Prices';
    }
}

// Render account actions
function renderAccountActions(data) {
    const container = document.getElementById('account-actions');
    container.innerHTML = '';

    const adjustmentsByTicker = {};
    data.adjustments.forEach(adj => {
        adjustmentsByTicker[adj.ticker] = adj;
    });

    const accounts = Object.keys(data.account_actions).sort();

    if (accounts.length === 0 || accounts.every(acc => data.account_actions[acc].length === 0)) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #4caf50; font-size: 1.2em;">Portfolio is well balanced. No rebalancing actions needed.</div>';
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
                                <span class="weight-arrow">&rarr;</span>
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
                                <span class="weight-arrow">&rarr;</span>
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
let currentTypeFilter = 'all';
let currentSort = { column: null, direction: 'asc' };
let holdingsData = null;

// Render holdings table
function renderHoldingsTable(data) {
    const tbody = document.getElementById('holdings-tbody');
    tbody.innerHTML = '';

    holdingsData = data;

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
    let totalBookCost = 0;
    let totalCurrentWeight = 0;
    let totalTargetWeight = 0;

    // Group by asset type for display
    const assetTypeOrder = ['EQ', 'MA', 'FI', 'AA'];
    const tickersByType = {};

    Object.keys(holdingsByTicker).forEach(ticker => {
        const type = holdingsByTicker[ticker][0].asset_type || 'EQ';
        if (!tickersByType[type]) tickersByType[type] = [];
        tickersByType[type].push(ticker);
    });

    // Sort tickers within each type
    Object.keys(tickersByType).forEach(type => {
        tickersByType[type].sort();
    });

    assetTypeOrder.forEach(type => {
        const tickers = tickersByType[type];
        if (!tickers || tickers.length === 0) return;

        // Asset type header row
        const headerRow = document.createElement('tr');
        headerRow.className = 'asset-type-header';
        headerRow.innerHTML = `<td colspan="11"><strong>${getAssetTypeLabel(type)}</strong></td>`;
        tbody.appendChild(headerRow);

        tickers.forEach(ticker => {
            const tickerHoldings = holdingsByTicker[ticker];
            const tickerTotalValue = tickerHoldings.reduce((sum, h) => sum + h.current_value, 0);
            const tickerBookCost = tickerHoldings.reduce((sum, h) => sum + (h.book_cost || 0), 0);
            const tickerQty = tickerHoldings.reduce((sum, h) => sum + (h.quantity || 0), 0);
            const tickerCurrentWeight = tickerHoldings.reduce((sum, h) => sum + h.current_weight, 0);
            const tickerTargetWeight = Math.max(...tickerHoldings.map(h => h.target_weight));
            const tickerPL = tickerBookCost > 0 ? ((tickerTotalValue - tickerBookCost) / tickerBookCost * 100) : 0;
            const lastPrice = tickerHoldings[0].last_price || (tickerTotalValue / tickerQty);
            const isAutoPrice = tickerHoldings[0].auto_price;
            const priceUpdated = tickerHoldings[0].price_updated;

            totalValue += tickerTotalValue;
            totalBookCost += tickerBookCost;
            totalCurrentWeight += tickerCurrentWeight;
            totalTargetWeight += tickerTargetWeight;

            const tickerId = `ticker-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;

            // Price freshness
            let priceAge = '';
            if (priceUpdated) {
                const updatedDate = new Date(priceUpdated);
                const now = new Date();
                const diffHours = Math.floor((now - updatedDate) / (1000 * 60 * 60));
                if (diffHours < 1) priceAge = 'just now';
                else if (diffHours < 24) priceAge = `${diffHours}h ago`;
                else priceAge = `${Math.floor(diffHours / 24)}d ago`;
            }

            // Master row
            const masterRow = document.createElement('tr');
            masterRow.className = 'master-row';

            let firstColumnContent;
            if (tickerHoldings.length > 1) {
                firstColumnContent = `<span class="expand-icon" onclick="toggleAccounts('${tickerId}')" style="cursor: pointer;">&#9654; Multiple</span>`;
            } else {
                const ownerName = tickerHoldings[0].owner === 'EF' ? 'Ed' : 'Lucy';
                const fullAccount = `${ownerName} ${tickerHoldings[0].account}`;
                firstColumnContent = `<span class="account-badge">${fullAccount}</span>`;
            }

            const plClass = tickerPL >= 0 ? 'pl-positive' : 'pl-negative';
            const priceClass = isAutoPrice ? 'price-auto' : 'price-manual';
            const priceSource = priceSources[ticker];
            const sourceLabel = priceSource ? priceSource.source : 'Manual';
            const sourceUrl = priceSource ? priceSource.url : null;
            const priceTitle = isAutoPrice
                ? `${sourceLabel} - updated ${priceAge} - click to edit`
                : 'Manual price - click to update';

            const sourceLinkHtml = sourceUrl
                ? `<a href="${sourceUrl}" target="_blank" class="source-link" title="View on ${sourceLabel}" onclick="event.stopPropagation()">&nearr;</a>`
                : '';

            masterRow.innerHTML = `
                <td>${firstColumnContent}</td>
                <td><strong>${ticker}</strong></td>
                <td>${tickerHoldings[0].name}</td>
                <td class="num">${formatQuantity(tickerQty)}</td>
                <td class="num">${formatCurrency(tickerBookCost)}</td>
                <td class="num ${priceClass}" onclick="editTickerPrice(this, '${ticker}')" title="${priceTitle}">
                    ${formatPrice(lastPrice)}${sourceLinkHtml}
                </td>
                <td class="num editable" onclick="editTickerValue(this, '${ticker}')" title="Click to edit value">${formatCurrency(tickerTotalValue)}</td>
                <td class="num ${plClass}">${formatPL(tickerPL)}</td>
                <td class="num">${formatPercentage(tickerCurrentWeight)}</td>
                <td class="num editable" onclick="editTickerTarget(this, '${ticker}')" title="Click to edit target">${formatPercentage(tickerTargetWeight)}</td>
                <td>
                    ${tickerHoldings.length === 1 ? `<button class="btn btn-danger" onclick="deleteHolding('${ticker}', '${tickerHoldings[0].account}', '${tickerHoldings[0].owner}', '${tickerHoldings[0].name}')">Del</button>` : ''}
                </td>
            `;
            tbody.appendChild(masterRow);

            // Account detail rows (initially hidden)
            if (tickerHoldings.length > 1) {
                tickerHoldings.forEach(holding => {
                    const ownerName = holding.owner === 'EF' ? 'Ed' : 'Lucy';
                    const fullAccount = `${ownerName} ${holding.account}`;
                    const holdingPL = holding.pl_pct || 0;
                    const holdingPLClass = holdingPL >= 0 ? 'pl-positive' : 'pl-negative';

                    const detailRow = document.createElement('tr');
                    detailRow.className = `detail-row ${tickerId}`;
                    detailRow.style.display = 'none';
                    detailRow.innerHTML = `
                        <td></td>
                        <td colspan="2" style="padding-left: 40px;"><span class="account-badge">${fullAccount}</span></td>
                        <td class="num">${formatQuantity(holding.quantity || 0)}</td>
                        <td class="num">${formatCurrency(holding.book_cost || 0)}</td>
                        <td class="num">${formatPrice(holding.last_price || 0)}</td>
                        <td class="num editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'current_value')" title="Click to edit value">${formatCurrency(holding.current_value)}</td>
                        <td class="num ${holdingPLClass}">${formatPL(holdingPL)}</td>
                        <td class="num">${formatPercentage(holding.current_weight)}</td>
                        <td class="num editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'target_weight')" title="Click to edit target">${formatPercentage(holding.target_weight)}</td>
                        <td>
                            <button class="btn btn-danger" onclick="deleteHolding('${holding.ticker}', '${holding.account}', '${holding.owner}', '${holding.name}')">Del</button>
                        </td>
                    `;
                    tbody.appendChild(detailRow);
                });
            }
        });
    });

    // Add cash row
    const cashPercentage = (data.total_cash / data.total_value * 100);
    const cashTarget = data.cash_target_percentage || 7.6;

    const cashRow = document.createElement('tr');
    cashRow.className = 'cash-row';
    cashRow.innerHTML = `
        <td colspan="6" style="text-align: right;"><strong>CASH:</strong></td>
        <td class="num"><strong>${formatCurrency(data.total_cash)}</strong></td>
        <td></td>
        <td class="num"><strong>${formatPercentage(cashPercentage)}</strong></td>
        <td class="num editable" onclick="editCashTarget(this, ${cashTarget})" title="Click to edit target"><strong>${formatPercentage(cashTarget)}</strong></td>
        <td></td>
    `;
    tbody.appendChild(cashRow);

    // Add totals row
    const grandTotalValue = totalValue + data.total_cash;
    const grandTotalCurrent = totalCurrentWeight + cashPercentage;
    const grandTotalTarget = totalTargetWeight + cashTarget;
    const totalPL = totalBookCost > 0 ? ((totalValue - totalBookCost) / totalBookCost * 100) : 0;
    const totalPLClass = totalPL >= 0 ? 'pl-positive' : 'pl-negative';

    const totalsRow = document.createElement('tr');
    totalsRow.className = 'totals-row';
    totalsRow.innerHTML = `
        <td colspan="4" style="text-align: right;"><strong>TOTAL:</strong></td>
        <td class="num"><strong>${formatCurrency(totalBookCost)}</strong></td>
        <td></td>
        <td class="num"><strong>${formatCurrency(grandTotalValue)}</strong></td>
        <td class="num ${totalPLClass}"><strong>${formatPL(totalPL)}</strong></td>
        <td class="num"><strong>${formatPercentage(grandTotalCurrent)}</strong></td>
        <td class="num"><strong>${formatPercentage(grandTotalTarget)}</strong></td>
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
            expandIcon.innerHTML = '&#9660; Multiple';
        } else {
            row.style.display = 'none';
            expandIcon.innerHTML = '&#9654; Multiple';
        }
    });
}

// Edit ticker price (per unit)
async function editTickerPrice(cell, ticker) {
    if (editingCell) return;

    editingCell = cell;
    const currentValue = cell.textContent.replace(/[£,M]/g, '').trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = parseFloat(currentValue) || 0;
    input.style.width = '100%';

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newPrice = parseFloat(input.value);
        if (isNaN(newPrice) || newPrice <= 0) {
            alert('Invalid price');
            await loadPortfolioData();
            editingCell = null;
            return;
        }

        try {
            // Update price for all holdings of this ticker
            const response = await fetch('/api/holdings/update-ticker-value', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ticker, new_price: newPrice})
            });

            if (response.ok) {
                await loadPortfolioData();
            } else {
                alert('Failed to update price');
                await loadPortfolioData();
            }
        } catch (error) {
            alert('Error: ' + error.message);
            await loadPortfolioData();
        }
        editingCell = null;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveEdit();
        else if (e.key === 'Escape') { editingCell = null; loadPortfolioData(); }
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
        if (e.key === 'Enter') saveEdit();
        else if (e.key === 'Escape') {
            cell.textContent = formatCurrency(parseFloat(currentValue));
            editingCell = null;
        }
    });
}

// Edit ticker target weight
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
        if (e.key === 'Enter') saveEdit();
        else if (e.key === 'Escape') {
            cell.textContent = formatPercentage(parseFloat(currentValue));
            editingCell = null;
        }
    });
}

// Edit cell inline
let editingCell = null;
function editCell(cell, ticker, account, owner, field) {
    if (editingCell) return;

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
                await loadPortfolioData();
            } else {
                alert('Failed to update holding');
                if (field === 'current_value') cell.textContent = formatCurrency(parseFloat(currentValue));
                else if (field === 'target_weight') cell.textContent = formatPercentage(parseFloat(currentValue));
                else cell.textContent = currentValue;
            }
        } catch (error) {
            alert('Error: ' + error.message);
            if (field === 'current_value') cell.textContent = formatCurrency(parseFloat(currentValue));
            else if (field === 'target_weight') cell.textContent = formatPercentage(parseFloat(currentValue));
            else cell.textContent = currentValue;
        }
        editingCell = null;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveEdit();
        else if (e.key === 'Escape') {
            if (field === 'current_value') cell.textContent = formatCurrency(parseFloat(currentValue));
            else if (field === 'target_weight') cell.textContent = formatPercentage(parseFloat(currentValue));
            else cell.textContent = currentValue;
            editingCell = null;
        }
    });
}

// Save cash balance directly from input
let cashSaveTimeout = null;
async function saveCashBalance(account, value) {
    const newValue = parseFloat(value);
    if (isNaN(newValue) || newValue < 0) return;

    // Debounce to avoid double-saves from onchange + onblur
    clearTimeout(cashSaveTimeout);
    cashSaveTimeout = setTimeout(async () => {
        try {
            const response = await fetch('/api/cash/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({account, amount: newValue})
            });

            if (response.ok) {
                await loadPortfolioData();
            } else {
                alert('Failed to update cash balance');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }, 300);
}

// Delete holding
async function deleteHolding(ticker, account, owner, name) {
    if (!confirm(`Are you sure you want to delete ${name} (${ticker})?`)) return;

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

// Save holding
async function saveHolding(event) {
    event.preventDefault();

    const quantity = parseFloat(document.getElementById('form-quantity').value);
    const price = parseFloat(document.getElementById('form-price').value);
    const value = quantity * price;
    const bookCost = parseFloat(document.getElementById('form-book-cost').value) || value;
    const targetWeight = parseFloat(document.getElementById('form-target-weight').value) || 0;

    const holdingData = {
        owner: document.getElementById('form-owner').value,
        account: document.getElementById('form-account').value,
        asset_type: document.getElementById('form-asset-type').value,
        ticker: document.getElementById('form-ticker').value,
        name: document.getElementById('form-name').value,
        quantity: quantity,
        last_price: price,
        book_cost: bookCost,
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
    input.style.padding = '5px';
    input.style.border = '2px solid #667eea';
    input.style.borderRadius = '3px';

    if (element.tagName === 'TD') {
        input.style.background = 'white';
        input.style.color = '#333';
    } else {
        input.style.background = 'rgba(255,255,255,0.2)';
        input.style.color = 'white';
    }

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
        if (e.key === 'Enter') saveEdit();
        else if (e.key === 'Escape') { editingCashTarget = null; loadPortfolioData(); }
    });
}

// Handle CSV file upload
async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

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
            alert(`Imported ${result.holdings_count} holdings and ${result.accounts_count} cash accounts.`);
            await loadPortfolioData();
        } else {
            alert('Failed to import CSV: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
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

    const accounts = new Set();
    holdings.forEach(holding => {
        const ownerName = holding.owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
        const fullAccount = `${ownerName} ${holding.account}`;
        accounts.add(fullAccount);
    });

    const sortedAccounts = Array.from(accounts).sort();

    accountFilter.innerHTML = '<option value="all">All Accounts</option>';
    sortedAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.textContent = account;
        accountFilter.appendChild(option);
    });

    if (currentValue && Array.from(accountFilter.options).some(opt => opt.value === currentValue)) {
        accountFilter.value = currentValue;
    }
}

// Apply filters and sorting
function applyFiltersAndSort() {
    if (!holdingsData) return;

    currentFilter = document.getElementById('account-filter').value;
    currentTypeFilter = document.getElementById('type-filter').value;

    let filteredHoldings = holdingsData.holdings;

    if (currentFilter !== 'all') {
        filteredHoldings = filteredHoldings.filter(holding => {
            const ownerName = holding.owner === 'EF' ? 'Ed Forrester' : 'Lucy Forrester';
            const fullAccount = `${ownerName} ${holding.account}`;
            return fullAccount === currentFilter;
        });
    }

    if (currentTypeFilter !== 'all') {
        filteredHoldings = filteredHoldings.filter(holding => {
            return (holding.asset_type || 'EQ') === currentTypeFilter;
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

    let tickerTotals = Object.keys(holdingsByTicker).map(ticker => {
        const tickerHoldings = holdingsByTicker[ticker];
        const tickerTotalValue = tickerHoldings.reduce((sum, h) => sum + h.current_value, 0);
        const tickerBookCost = tickerHoldings.reduce((sum, h) => sum + (h.book_cost || 0), 0);
        const tickerCurrentWeight = tickerHoldings.reduce((sum, h) => sum + h.current_weight, 0);
        const tickerTargetWeight = Math.max(...tickerHoldings.map(h => h.target_weight));
        const tickerPL = tickerBookCost > 0 ? ((tickerTotalValue - tickerBookCost) / tickerBookCost * 100) : 0;

        return {
            ticker,
            holdings: tickerHoldings,
            totalValue: tickerTotalValue,
            bookCost: tickerBookCost,
            currentWeight: tickerCurrentWeight,
            targetWeight: tickerTargetWeight,
            pl: tickerPL,
            name: tickerHoldings[0].name,
            assetType: tickerHoldings[0].asset_type || 'EQ'
        };
    });

    // Apply sorting
    if (currentSort.column) {
        tickerTotals.sort((a, b) => {
            let aVal, bVal;
            switch(currentSort.column) {
                case 'value': aVal = a.totalValue; bVal = b.totalValue; break;
                case 'book_cost': aVal = a.bookCost; bVal = b.bookCost; break;
                case 'current': aVal = a.currentWeight; bVal = b.currentWeight; break;
                case 'target': aVal = a.targetWeight; bVal = b.targetWeight; break;
                case 'pl': aVal = a.pl; bVal = b.pl; break;
                default: return 0;
            }
            return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        });
    } else {
        tickerTotals.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    updateSortIndicators();
    renderFilteredTable(tickerTotals, holdingsData);
}

// Update sort indicators
function updateSortIndicators() {
    ['value', 'book_cost', 'current', 'target', 'pl'].forEach(col => {
        const indicator = document.getElementById(`sort-${col}`);
        if (indicator) indicator.textContent = '';
    });

    if (currentSort.column) {
        const indicator = document.getElementById(`sort-${currentSort.column}`);
        if (indicator) indicator.textContent = currentSort.direction === 'asc' ? '\u25B2' : '\u25BC';
    }
}

// Sort table by column
function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'desc';
    }
    applyFiltersAndSort();
}

// Reset filters and sorting
function resetFiltersAndSort() {
    currentFilter = 'all';
    currentTypeFilter = 'all';
    currentSort = { column: null, direction: 'asc' };
    document.getElementById('account-filter').value = 'all';
    document.getElementById('type-filter').value = 'all';
    updateSortIndicators();
    if (holdingsData) renderHoldingsTable(holdingsData);
}

// Render filtered table
function renderFilteredTable(tickerTotals, data) {
    const tbody = document.getElementById('holdings-tbody');
    tbody.innerHTML = '';

    let totalValue = 0;
    let totalBookCost = 0;
    let totalCurrentWeight = 0;
    let totalTargetWeight = 0;

    // Group by asset type
    const assetTypeOrder = ['EQ', 'MA', 'FI', 'AA'];
    const tickersByType = {};

    tickerTotals.forEach(td => {
        const type = td.assetType;
        if (!tickersByType[type]) tickersByType[type] = [];
        tickersByType[type].push(td);
    });

    assetTypeOrder.forEach(type => {
        const tickers = tickersByType[type];
        if (!tickers || tickers.length === 0) return;

        // Don't show type header if sorting is active (flat view)
        if (!currentSort.column) {
            const headerRow = document.createElement('tr');
            headerRow.className = 'asset-type-header';
            headerRow.innerHTML = `<td colspan="11"><strong>${getAssetTypeLabel(type)}</strong></td>`;
            tbody.appendChild(headerRow);
        }

        tickers.forEach(tickerData => {
            const ticker = tickerData.ticker;
            const tickerHoldings = tickerData.holdings;
            const tickerTotalValue = tickerData.totalValue;
            const tickerBookCost = tickerData.bookCost;
            const tickerCurrentWeight = tickerData.currentWeight;
            const tickerTargetWeight = tickerData.targetWeight;
            const tickerPL = tickerData.pl;
            const tickerQty = tickerHoldings.reduce((sum, h) => sum + (h.quantity || 0), 0);
            const lastPrice = tickerHoldings[0].last_price || (tickerTotalValue / tickerQty);
            const isAutoPrice = tickerHoldings[0].auto_price;

            totalValue += tickerTotalValue;
            totalBookCost += tickerBookCost;
            totalCurrentWeight += tickerCurrentWeight;
            totalTargetWeight += tickerTargetWeight;

            const tickerId = `ticker-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;
            const plClass = tickerPL >= 0 ? 'pl-positive' : 'pl-negative';
            const priceClass = isAutoPrice ? 'price-auto' : 'price-manual';

            const masterRow = document.createElement('tr');
            masterRow.className = 'master-row';

            let firstColumnContent;
            if (tickerHoldings.length > 1) {
                firstColumnContent = `<span class="expand-icon" onclick="toggleAccounts('${tickerId}')" style="cursor: pointer;">&#9654; Multiple</span>`;
            } else {
                const ownerName = tickerHoldings[0].owner === 'EF' ? 'Ed' : 'Lucy';
                const fullAccount = `${ownerName} ${tickerHoldings[0].account}`;
                firstColumnContent = `<span class="account-badge">${fullAccount}</span>`;
            }

            masterRow.innerHTML = `
                <td>${firstColumnContent}</td>
                <td><strong>${ticker}</strong></td>
                <td>${tickerHoldings[0].name}</td>
                <td class="num">${formatQuantity(tickerQty)}</td>
                <td class="num">${formatCurrency(tickerBookCost)}</td>
                <td class="num ${priceClass}" onclick="editTickerPrice(this, '${ticker}')" title="Click to edit price">
                    ${formatPrice(lastPrice)}
                    ${!isAutoPrice ? '<span class="manual-indicator">M</span>' : ''}
                </td>
                <td class="num editable" onclick="editTickerValue(this, '${ticker}')" title="Click to edit value">${formatCurrency(tickerTotalValue)}</td>
                <td class="num ${plClass}">${formatPL(tickerPL)}</td>
                <td class="num">${formatPercentage(tickerCurrentWeight)}</td>
                <td class="num editable" onclick="editTickerTarget(this, '${ticker}')" title="Click to edit target">${formatPercentage(tickerTargetWeight)}</td>
                <td>
                    ${tickerHoldings.length === 1 ? `<button class="btn btn-danger" onclick="deleteHolding('${ticker}', '${tickerHoldings[0].account}', '${tickerHoldings[0].owner}', '${tickerHoldings[0].name}')">Del</button>` : ''}
                </td>
            `;
            tbody.appendChild(masterRow);

            if (tickerHoldings.length > 1) {
                tickerHoldings.forEach(holding => {
                    const ownerName = holding.owner === 'EF' ? 'Ed' : 'Lucy';
                    const fullAccount = `${ownerName} ${holding.account}`;
                    const holdingPL = holding.pl_pct || 0;
                    const holdingPLClass = holdingPL >= 0 ? 'pl-positive' : 'pl-negative';

                    const detailRow = document.createElement('tr');
                    detailRow.className = `detail-row ${tickerId}`;
                    detailRow.style.display = 'none';
                    detailRow.innerHTML = `
                        <td></td>
                        <td colspan="2" style="padding-left: 40px;"><span class="account-badge">${fullAccount}</span></td>
                        <td class="num">${formatQuantity(holding.quantity || 0)}</td>
                        <td class="num">${formatCurrency(holding.book_cost || 0)}</td>
                        <td class="num">${formatPrice(holding.last_price || 0)}</td>
                        <td class="num editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'current_value')">${formatCurrency(holding.current_value)}</td>
                        <td class="num ${holdingPLClass}">${formatPL(holdingPL)}</td>
                        <td class="num">${formatPercentage(holding.current_weight)}</td>
                        <td class="num editable" onclick="editCell(this, '${holding.ticker}', '${holding.account}', '${holding.owner}', 'target_weight')">${formatPercentage(holding.target_weight)}</td>
                        <td>
                            <button class="btn btn-danger" onclick="deleteHolding('${holding.ticker}', '${holding.account}', '${holding.owner}', '${holding.name}')">Del</button>
                        </td>
                    `;
                    tbody.appendChild(detailRow);
                });
            }
        });
    });

    // When sorting is active but we have un-categorized tickers
    if (currentSort.column) {
        // Already rendered above in flat mode
    }

    // Cash row
    const cashPercentage = (data.total_cash / data.total_value * 100);
    const cashTarget = data.cash_target_percentage || 7.6;

    const cashRow = document.createElement('tr');
    cashRow.className = 'cash-row';
    cashRow.innerHTML = `
        <td colspan="6" style="text-align: right;"><strong>CASH:</strong></td>
        <td class="num"><strong>${formatCurrency(data.total_cash)}</strong></td>
        <td></td>
        <td class="num"><strong>${formatPercentage(cashPercentage)}</strong></td>
        <td class="num editable" onclick="editCashTarget(this, ${cashTarget})"><strong>${formatPercentage(cashTarget)}</strong></td>
        <td></td>
    `;
    tbody.appendChild(cashRow);

    // Totals row
    const grandTotalValue = totalValue + data.total_cash;
    const grandTotalCurrent = totalCurrentWeight + cashPercentage;
    const grandTotalTarget = totalTargetWeight + cashTarget;
    const totalPL = totalBookCost > 0 ? ((totalValue - totalBookCost) / totalBookCost * 100) : 0;
    const totalPLClass = totalPL >= 0 ? 'pl-positive' : 'pl-negative';

    const totalsRow = document.createElement('tr');
    totalsRow.className = 'totals-row';
    totalsRow.innerHTML = `
        <td colspan="4" style="text-align: right;"><strong>TOTAL:</strong></td>
        <td class="num"><strong>${formatCurrency(totalBookCost)}</strong></td>
        <td></td>
        <td class="num"><strong>${formatCurrency(grandTotalValue)}</strong></td>
        <td class="num ${totalPLClass}"><strong>${formatPL(totalPL)}</strong></td>
        <td class="num"><strong>${formatPercentage(grandTotalCurrent)}</strong></td>
        <td class="num"><strong>${formatPercentage(grandTotalTarget)}</strong></td>
        <td></td>
    `;
    tbody.appendChild(totalsRow);
}

// Toggle collapsible sections
function toggleSection(contentId) {
    const content = document.getElementById(contentId);
    const header = content.previousElementSibling;
    const icon = header.querySelector('.collapse-icon');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        header.classList.remove('collapsed');
        icon.innerHTML = '&#9660;';
    } else {
        content.style.display = 'none';
        header.classList.add('collapsed');
        icon.innerHTML = '&#9654;';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadPortfolioData();
    // Auto-refresh prices on every visit
    refreshPrices();
});
