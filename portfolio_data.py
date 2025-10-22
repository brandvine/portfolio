#!/usr/bin/env python3
"""
Portfolio Data Manager
Handles loading, saving, and updating portfolio data
"""

import json
import os
from typing import Dict, List
from portfolio_rebalancer import load_portfolio, Holding


DATA_FILE = "portfolio_data.json"


def initialize_from_csv(csv_file_path=None):
    """
    Initialize JSON data from CSV file
    This function completely clears the existing data and reimports from CSV
    CSV Column mapping:
    - Column A: Owner (EF/LF)
    - Column C: Account
    - Column D: Ticker
    - Column E: Security Name
    - Column L: Value
    - Column N: Current Weight %
    - Column O: Target Weight %

    Args:
        csv_file_path: Path to CSV file. If None, uses default "Investments - Sheet4.csv"

    Returns:
        Tuple of (data dict, holdings count, accounts count)
    """
    if csv_file_path is None:
        csv_file_path = "Investments - Sheet4.csv"

    holdings, cash_balances, total_value = load_portfolio(csv_file_path)

    # Create fresh data structure (clears all existing data)
    data = {
        'holdings': [],
        'cash_balances': cash_balances,
        'cash_target_percentage': 7.6  # Default cash target
    }

    for h in holdings:
        data['holdings'].append({
            'owner': h.owner,
            'asset_type': h.asset_type,
            'account': h.account,
            'ticker': h.ticker,
            'name': h.name,
            'quantity': h.quantity,
            'last_price': h.current_value / h.quantity if h.quantity > 0 else 0,
            'book_cost': h.book_cost,
            'current_value': h.current_value,
            'target_weight': h.target_weight
        })

    save_portfolio_data(data)
    return data, len(holdings), len(cash_balances)


def load_portfolio_data():
    """Load portfolio data from JSON file"""
    if not os.path.exists(DATA_FILE):
        data, _, _ = initialize_from_csv()
        return data

    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        data, _, _ = initialize_from_csv()
        return data


def save_portfolio_data(data):
    """Save portfolio data to JSON file"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def update_holding(ticker, account, owner, updates):
    """Update a specific holding"""
    data = load_portfolio_data()

    for holding in data['holdings']:
        if (holding['ticker'] == ticker and
            holding['account'] == account and
            holding['owner'] == owner):
            holding.update(updates)
            # Recalculate current value if quantity or price changed
            if 'quantity' in updates or 'last_price' in updates:
                holding['current_value'] = holding['quantity'] * holding['last_price']
            save_portfolio_data(data)
            return True

    return False


def add_holding(holding_data):
    """Add a new holding"""
    data = load_portfolio_data()

    # Calculate current value
    holding_data['current_value'] = holding_data['quantity'] * holding_data['last_price']

    data['holdings'].append(holding_data)
    save_portfolio_data(data)
    return True


def delete_holding(ticker, account, owner):
    """Delete a holding and add its value to cash"""
    data = load_portfolio_data()

    # Find the holding to delete and get its value
    holding_to_delete = None
    for h in data['holdings']:
        if h['ticker'] == ticker and h['account'] == account and h['owner'] == owner:
            holding_to_delete = h
            break

    if holding_to_delete:
        # Add holding value to cash balance
        owner_name = "Ed Forrester" if owner == "EF" else "Lucy Forrester"
        account_name = f"{owner_name} {account}"

        current_cash = data['cash_balances'].get(account_name, 0)
        data['cash_balances'][account_name] = current_cash + holding_to_delete['current_value']

    # Remove the holding
    data['holdings'] = [
        h for h in data['holdings']
        if not (h['ticker'] == ticker and h['account'] == account and h['owner'] == owner)
    ]

    save_portfolio_data(data)
    return True


def update_cash_balance(account_full_name, amount):
    """Update cash balance for an account"""
    data = load_portfolio_data()
    data['cash_balances'][account_full_name] = amount
    save_portfolio_data(data)
    return True


def update_cash_target(target_percentage):
    """Update cash target percentage"""
    data = load_portfolio_data()
    data['cash_target_percentage'] = target_percentage
    save_portfolio_data(data)
    return True


def get_holdings_list():
    """Get list of all holdings with calculated values"""
    data = load_portfolio_data()

    # Ensure cash_target_percentage exists (for backwards compatibility)
    if 'cash_target_percentage' not in data:
        data['cash_target_percentage'] = 7.6
        save_portfolio_data(data)

    # Calculate total portfolio value
    total_invested = sum(h['current_value'] for h in data['holdings'])
    total_cash = sum(data['cash_balances'].values())
    total_value = total_invested + total_cash

    # Calculate current weights
    for holding in data['holdings']:
        holding['current_weight'] = (holding['current_value'] / total_value * 100) if total_value > 0 else 0

    return data['holdings'], data['cash_balances'], total_value


def reimport_from_csv(csv_file_path=None):
    """
    Reimport data from CSV, overwriting current data

    Args:
        csv_file_path: Path to CSV file. If None, uses default "Investments - Sheet4.csv"

    Returns:
        Tuple of (holdings count, accounts count)
    """
    _, holdings_count, accounts_count = initialize_from_csv(csv_file_path)
    return holdings_count, accounts_count
