#!/usr/bin/env python3
"""
Portfolio Rebalancing Tool
Analyzes investment portfolio across multiple accounts and provides rebalancing recommendations
"""

import csv
import re
from typing import Dict, List, Tuple
from dataclasses import dataclass
from collections import defaultdict


@dataclass
class Holding:
    """Represents a single investment holding"""
    owner: str  # EF or LF
    asset_type: str  # EQ, MA, FI, AA
    account: str  # SIPP or ISA
    ticker: str
    name: str
    quantity: float
    book_cost: float
    current_value: float
    current_weight: float
    target_weight: float

    @property
    def full_account(self) -> str:
        """Returns full account name like 'Ed Forrester SIPP'"""
        owner_name = "Ed Forrester" if self.owner == "EF" else "Lucy Forrester"
        return f"{owner_name} {self.account}"


@dataclass
class CashBalance:
    """Represents cash in an account"""
    account: str
    amount: float


def parse_currency(value: str) -> float:
    """Parse currency string to float"""
    if not value or value == '':
        return 0.0
    # Remove currency symbols, commas, and quotes
    cleaned = re.sub(r'[£,"\'"]', '', str(value))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_percentage(value: str) -> float:
    """Parse percentage string to float"""
    if not value or value == '':
        return 0.0
    cleaned = value.strip().rstrip('%')
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_quantity(value: str) -> float:
    """Parse quantity string to float"""
    if not value or value == '':
        return 0.0
    cleaned = re.sub(r'[,"]', '', str(value))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def load_portfolio(csv_file: str) -> Tuple[List[Holding], Dict[str, float], float]:
    """
    Load portfolio from CSV file
    CSV Column mapping:
    - Column A (index 0): Owner (EF/LF)
    - Column C (index 2): Account (SIPP/ISA)
    - Column D (index 3): Ticker
    - Column E (index 4): Security Name
    - Column L (index 11): Value
    - Column N (index 13): Current Weight %
    - Column O (index 14): Target Weight %

    Returns: (holdings list, cash balances dict, total portfolio value)
    """
    holdings = []
    cash_balances = {}
    total_value = 0.0

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # Skip header row

        for row in reader:
            if len(row) < 15:
                continue

            # Column A: Owner
            owner = row[0].strip()

            # Skip empty rows
            if not owner:
                continue

            # Skip category header rows and totals
            if owner in ['Equities', 'Multi Asset', 'Fixed Income', 'Alternative Assets', 'Total', '']:
                continue

            # Column C: Account
            account = row[2].strip()
            if not account:
                continue

            # Column D: Ticker
            ticker = row[3].strip()

            # Column E: Security Name
            name = row[4].strip()

            # Column L: Value
            current_value = parse_currency(row[11])

            # Column N: Current Weight
            current_weight = parse_percentage(row[13])

            # Column O: Target Weight
            target_weight = parse_percentage(row[14])

            # Handle cash rows (no ticker)
            if not ticker or ticker.upper() == 'CASH':
                if current_value > 0:
                    owner_name = "Ed Forrester" if owner == "EF" else "Lucy Forrester"
                    account_name = f"{owner_name} {account}"
                    cash_balances[account_name] = current_value
                continue

            # Skip rows with no value
            if current_value <= 0:
                continue

            # Create holding with parsed data
            holding = Holding(
                owner=owner,
                asset_type='EQ',  # Default to Equity (asset_type not in required columns)
                account=account,
                ticker=ticker,
                name=name,
                quantity=1.0,  # Default quantity (not in required columns)
                book_cost=current_value,  # Use current value as book cost (not in required columns)
                current_value=current_value,
                current_weight=current_weight,
                target_weight=target_weight
            )
            holdings.append(holding)

    # Calculate total portfolio value
    total_value = sum(h.current_value for h in holdings) + sum(cash_balances.values())

    return holdings, cash_balances, total_value


def analyze_rebalancing(holdings: List[Holding], cash_balances: Dict[str, float],
                        total_value: float, cash_target_percentage: float = 7.6) -> Dict:
    """
    Analyze portfolio and determine rebalancing needs
    Cash is treated as an allocation with its own target percentage
    """
    results = {
        'total_value': total_value,
        'cash_balances': cash_balances,
        'total_cash': sum(cash_balances.values()),
        'adjustments': [],
        'account_actions': defaultdict(list),
        'account_cash_needs': defaultdict(float)
    }

    # Calculate target cash and investable amount
    target_cash_value = total_value * (cash_target_percentage / 100)
    current_cash = sum(cash_balances.values())

    # The investable amount is what should be in holdings
    # Target investable = total - target cash
    # Current investable = total - current cash
    target_investable = total_value - target_cash_value
    current_investable = sum(h.current_value for h in holdings)

    # Group holdings by ticker to see which accounts hold which investments
    holdings_by_ticker = defaultdict(list)
    for h in holdings:
        holdings_by_ticker[h.ticker].append(h)

    # First pass: Calculate all adjustments needed
    adjustments_by_ticker = {}
    for ticker, ticker_holdings in holdings_by_ticker.items():
        # Sum up current values and weights for this ticker across all accounts
        total_current_value = sum(h.current_value for h in ticker_holdings)

        # Get target weight - use the maximum if there are different values across accounts
        # (some accounts may have 0% target if the holding is being phased out there)
        target_weight = max(h.target_weight for h in ticker_holdings)

        if target_weight == 0:
            continue

        # Calculate target value based on target investable amount
        # target_weight is % of total portfolio, but we need to adjust for cash allocation
        # If holdings should be 92.4% of portfolio and this holding is 8% of portfolio,
        # then it should be 8% of total portfolio value
        target_value = total_value * (target_weight / 100)
        adjustment_value = target_value - total_current_value

        # Calculate current weight as % of total portfolio
        current_weight = (total_current_value / total_value * 100) if total_value > 0 else 0
        adjustment_pct = current_weight - target_weight

        if abs(adjustment_value) > 100:  # Only show meaningful adjustments
            action = "BUY" if adjustment_value > 0 else "SELL"

            adjustment = {
                'ticker': ticker,
                'name': ticker_holdings[0].name,
                'current_value': total_current_value,
                'target_value': target_value,
                'adjustment_value': adjustment_value,
                'current_weight': current_weight,
                'target_weight': target_weight,
                'adjustment_pct': adjustment_pct,
                'action': action,
                'held_in_accounts': [h.full_account for h in ticker_holdings],
                'holdings': ticker_holdings
            }
            results['adjustments'].append(adjustment)
            adjustments_by_ticker[ticker] = adjustment

    # Track available cash per account (will be updated as we allocate)
    available_cash_tracker = {acc: cash_balances.get(acc, 0) for acc in cash_balances.keys()}

    # Second pass: First allocate all SELL actions (these free up cash)
    for ticker, adjustment in adjustments_by_ticker.items():
        ticker_holdings = adjustment['holdings']
        total_current_value = adjustment['current_value']
        adjustment_value = adjustment['adjustment_value']

        # Check if any accounts have this holding with 0% target (should be fully sold)
        holdings_to_exit = [h for h in ticker_holdings if h.target_weight == 0 and h.current_value > 0]
        holdings_to_keep = [h for h in ticker_holdings if h.target_weight > 0]

        # First, sell out of accounts with 0% target
        for holding in holdings_to_exit:
            account = holding.full_account
            sell_amount = holding.current_value  # Sell everything

            results['account_actions'][account].append({
                'action': 'SELL',
                'ticker': ticker,
                'name': holding.name,
                'value': sell_amount
            })

            # Update available cash after this sell
            available_cash_tracker[account] = available_cash_tracker.get(account, 0) + sell_amount

        # Then handle proportional sells if overall position needs reduction
        if adjustment['action'] == 'SELL' and holdings_to_keep:
            # Calculate remaining sell needed after exiting 0% target accounts
            total_exit_value = sum(h.current_value for h in holdings_to_exit)
            remaining_sell = abs(adjustment_value) - total_exit_value

            if remaining_sell > 0:
                # Split remaining sell proportionally across accounts that are keeping the holding
                current_value_in_keep_accounts = sum(h.current_value for h in holdings_to_keep)

                for holding in holdings_to_keep:
                    account = holding.full_account
                    proportion = holding.current_value / current_value_in_keep_accounts if current_value_in_keep_accounts > 0 else 0
                    sell_amount = remaining_sell * proportion

                    results['account_actions'][account].append({
                        'action': 'SELL',
                        'ticker': ticker,
                        'name': holding.name,
                        'value': sell_amount
                    })

                    # Update available cash after this sell
                    available_cash_tracker[account] = available_cash_tracker.get(account, 0) + sell_amount

    # Third pass: Allocate BUY actions based on available cash (including freed cash from sells)
    for ticker, adjustment in adjustments_by_ticker.items():
        if adjustment['action'] == 'BUY':
            ticker_holdings = adjustment['holdings']
            adjustment_value = adjustment['adjustment_value']

            # Only buy in accounts that have a non-zero target for this holding
            holdings_to_buy = [h for h in ticker_holdings if h.target_weight > 0]

            if not holdings_to_buy:
                continue  # No accounts to buy in (shouldn't happen, but safe check)

            # Get accounts with non-zero targets and their available cash
            accounts_to_buy = [h.full_account for h in holdings_to_buy]
            account_cash_for_ticker = {acc: available_cash_tracker.get(acc, 0) for acc in accounts_to_buy}
            total_available_cash = sum(account_cash_for_ticker.values())

            if total_available_cash > 0:
                # Split proportionally based on available cash
                for holding in holdings_to_buy:
                    account = holding.full_account
                    cash_proportion = account_cash_for_ticker[account] / total_available_cash
                    buy_amount = adjustment_value * cash_proportion

                    results['account_actions'][account].append({
                        'action': 'BUY',
                        'ticker': ticker,
                        'name': holding.name,
                        'value': buy_amount
                    })

                    # Update available cash after this buy
                    available_cash_tracker[account] = available_cash_tracker.get(account, 0) - buy_amount
            else:
                # No cash available, split evenly and flag funding requirement
                for holding in holdings_to_buy:
                    account = holding.full_account
                    buy_amount = adjustment_value / len(holdings_to_buy)

                    results['account_actions'][account].append({
                        'action': 'BUY',
                        'ticker': ticker,
                        'name': holding.name,
                        'value': buy_amount
                    })

                    # Update available cash (will go negative)
                    available_cash_tracker[account] = available_cash_tracker.get(account, 0) - buy_amount

    # Calculate cash needs per account
    for account, actions in results['account_actions'].items():
        cash_needed = sum(a['value'] for a in actions if a['action'] == 'BUY')
        cash_freed = sum(abs(a['value']) for a in actions if a['action'] == 'SELL')
        available_cash = cash_balances.get(account, 0)

        net_cash_need = cash_needed - cash_freed - available_cash
        if net_cash_need > 0:
            results['account_cash_needs'][account] = net_cash_need

    # Sort adjustments by magnitude
    results['adjustments'].sort(key=lambda x: abs(x['adjustment_value']), reverse=True)

    # Remove 'holdings' from adjustments (not JSON serializable)
    for adj in results['adjustments']:
        adj.pop('holdings', None)

    return results


def print_report(results: Dict):
    """Print formatted rebalancing report"""

    print("=" * 80)
    print("PORTFOLIO REBALANCING ANALYSIS")
    print("=" * 80)
    print()

    print(f"Total Portfolio Value: £{results['total_value']:,.2f}")
    print(f"Total Cash Available: £{results['total_cash']:,.2f}")
    print()

    print("-" * 80)
    print("CASH BALANCES BY ACCOUNT")
    print("-" * 80)
    for account, balance in sorted(results['cash_balances'].items()):
        print(f"  {account:30s} £{balance:>12,.2f}")
    print()

    print("-" * 80)
    print("REBALANCING RECOMMENDATIONS")
    print("-" * 80)
    print()

    if not results['adjustments']:
        print("Portfolio is well balanced! No significant adjustments needed.")
    else:
        for adj in results['adjustments']:
            print(f"{'[' + adj['action'] + ']':6s} {adj['ticker']:10s} - {adj['name']}")
            print(f"       Current: £{adj['current_value']:>12,.2f} ({adj['current_weight']:>6.2f}%)")
            print(f"       Target:  £{adj['target_value']:>12,.2f} ({adj['target_weight']:>6.2f}%)")
            print(f"       Adjust:  £{adj['adjustment_value']:>12,.2f} ({adj['adjustment_pct']:>+6.2f}%)")
            print(f"       Held in: {', '.join(adj['held_in_accounts'])}")
            print()

    print("-" * 80)
    print("ACTIONS BY ACCOUNT")
    print("-" * 80)
    print()

    for account in sorted(results['account_actions'].keys()):
        actions = results['account_actions'][account]
        if not actions:
            continue

        print(f"\n{account}")
        print(f"  Current Cash: £{results['cash_balances'].get(account, 0):,.2f}")
        print()

        buys = [a for a in actions if a['action'] == 'BUY']
        sells = [a for a in actions if a['action'] == 'SELL']

        if sells:
            print("  Sells:")
            for action in sells:
                print(f"    - SELL £{abs(action['value']):>10,.2f} of {action['ticker']} ({action['name']})")

        if buys:
            print("  Buys:")
            for action in buys:
                print(f"    - BUY  £{action['value']:>10,.2f} of {action['ticker']} ({action['name']})")

        total_buys = sum(a['value'] for a in buys)
        total_sells = sum(abs(a['value']) for a in sells)
        net_cash = results['cash_balances'].get(account, 0) + total_sells - total_buys

        print()
        print(f"  Net cash after trades: £{net_cash:,.2f}")
        print()

    print("-" * 80)
    print("ACCOUNT FUNDING REQUIREMENTS")
    print("-" * 80)
    print()

    if not results['account_cash_needs']:
        print("All accounts have sufficient cash for rebalancing!")
    else:
        print("The following accounts need additional funding:")
        print()
        for account, need in sorted(results['account_cash_needs'].items()):
            print(f"  {account:30s} needs £{need:>12,.2f}")

    print()
    print("=" * 80)


def main():
    """Main execution function"""
    csv_file = "Investments - Sheet4.csv"

    print("Loading portfolio data...")
    holdings, cash_balances, total_value = load_portfolio(csv_file)

    print(f"Loaded {len(holdings)} holdings across {len(cash_balances)} accounts")
    print()

    print("Analyzing rebalancing needs...")
    results = analyze_rebalancing(holdings, cash_balances, total_value)

    print_report(results)


if __name__ == "__main__":
    main()
