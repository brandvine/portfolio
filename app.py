#!/usr/bin/env python3
"""
Portfolio Rebalancer Web Application
Flask backend serving portfolio analysis data
"""

from flask import Flask, render_template, jsonify, request
from portfolio_rebalancer import analyze_rebalancing, Holding
from portfolio_data import (
    get_holdings_list, update_holding, add_holding,
    delete_holding, update_cash_balance, update_cash_target,
    reimport_from_csv, load_portfolio_data
)
import json

app = Flask(__name__)


@app.route('/')
def index():
    """Serve the main dashboard page"""
    return render_template('index.html')


@app.route('/api/portfolio')
def get_portfolio_data():
    """API endpoint to get portfolio analysis data"""
    try:
        holdings_data, cash_balances, total_value = get_holdings_list()

        # Get cash target
        data = load_portfolio_data()
        cash_target_percentage = data.get('cash_target_percentage', 7.6)

        # Create Holding objects for analysis
        holdings = []
        for h in holdings_data:
            owner_name = "Ed Forrester" if h['owner'] == "EF" else "Lucy Forrester"
            holding = Holding(
                owner=h['owner'],
                asset_type=h['asset_type'],
                account=h['account'],
                ticker=h['ticker'],
                name=h['name'],
                quantity=h['quantity'],
                book_cost=h['book_cost'],
                current_value=h['current_value'],
                current_weight=h['current_weight'],
                target_weight=h['target_weight']
            )
            holdings.append(holding)

        results = analyze_rebalancing(holdings, cash_balances, total_value, cash_target_percentage)

        # Convert defaultdict to regular dict for JSON serialization
        results['account_actions'] = dict(results['account_actions'])
        results['account_cash_needs'] = dict(results['account_cash_needs'])

        # Add raw holdings data for the table
        results['holdings'] = holdings_data

        # Add cash target
        results['cash_target_percentage'] = cash_target_percentage

        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/holdings/update', methods=['POST'])
def update_holding_endpoint():
    """Update a holding"""
    try:
        data = request.json
        success = update_holding(
            data['ticker'],
            data['account'],
            data['owner'],
            data['updates']
        )
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/holdings/add', methods=['POST'])
def add_holding_endpoint():
    """Add a new holding"""
    try:
        data = request.json
        success = add_holding(data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/holdings/delete', methods=['POST'])
def delete_holding_endpoint():
    """Delete a holding"""
    try:
        data = request.json
        success = delete_holding(
            data['ticker'],
            data['account'],
            data['owner']
        )
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cash/update', methods=['POST'])
def update_cash_endpoint():
    """Update cash balance"""
    try:
        data = request.json
        success = update_cash_balance(
            data['account'],
            data['amount']
        )
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cash-target/update', methods=['POST'])
def update_cash_target_endpoint():
    """Update cash target percentage"""
    try:
        data = request.json
        success = update_cash_target(data['target_percentage'])
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/import-csv', methods=['POST'])
def import_csv_endpoint():
    """Reimport data from CSV"""
    try:
        reimport_from_csv()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/portfolio-with-deposits', methods=['POST'])
def get_portfolio_with_deposits():
    """API endpoint to get portfolio analysis with deposit simulations"""
    try:
        # Get deposit adjustments from request
        deposit_adjustments = request.json.get('deposits', {})

        holdings_data, cash_balances, total_value = get_holdings_list()

        # Apply deposit adjustments to cash balances
        for account, deposit_amount in deposit_adjustments.items():
            if deposit_amount > 0:
                cash_balances[account] = cash_balances.get(account, 0) + deposit_amount

        # Recalculate total value with deposits
        total_invested = sum(h['current_value'] for h in holdings_data)
        total_value = total_invested + sum(cash_balances.values())

        # Get cash target
        data = load_portfolio_data()
        cash_target_percentage = data.get('cash_target_percentage', 7.6)

        # Create Holding objects for analysis
        holdings = []
        for h in holdings_data:
            owner_name = "Ed Forrester" if h['owner'] == "EF" else "Lucy Forrester"
            holding = Holding(
                owner=h['owner'],
                asset_type=h['asset_type'],
                account=h['account'],
                ticker=h['ticker'],
                name=h['name'],
                quantity=h['quantity'],
                book_cost=h['book_cost'],
                current_value=h['current_value'],
                current_weight=h['current_weight'],
                target_weight=h['target_weight']
            )
            holdings.append(holding)

        results = analyze_rebalancing(holdings, cash_balances, total_value, cash_target_percentage)

        # Convert defaultdict to regular dict for JSON serialization
        results['account_actions'] = dict(results['account_actions'])
        results['account_cash_needs'] = dict(results['account_cash_needs'])

        # Add raw holdings data for the table
        results['holdings'] = holdings_data

        # Add cash target
        results['cash_target_percentage'] = cash_target_percentage

        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/holdings/update-ticker-value', methods=['POST'])
def update_ticker_value_endpoint():
    """Update total value for a ticker (proportionally updates all accounts)"""
    try:
        ticker = request.json['ticker']
        new_value = request.json['new_value']

        data = load_portfolio_data()
        holdings = data['holdings']

        # Find all holdings for this ticker
        ticker_holdings = [h for h in holdings if h['ticker'] == ticker]

        if not ticker_holdings:
            return jsonify({'error': 'Ticker not found'}), 404

        # Calculate current total value
        current_total = sum(h['current_value'] for h in ticker_holdings)

        if current_total == 0:
            return jsonify({'error': 'Cannot update zero-value holding'}), 400

        # Calculate proportional updates
        ratio = new_value / current_total

        for holding in ticker_holdings:
            # Find the holding in the main list and update it
            for i, h in enumerate(holdings):
                if (h['ticker'] == holding['ticker'] and
                    h['account'] == holding['account'] and
                    h['owner'] == holding['owner']):
                    # Update current_value proportionally
                    holdings[i]['current_value'] = holding['current_value'] * ratio
                    # Update quantity proportionally (assuming price stays same)
                    holdings[i]['quantity'] = holding['quantity'] * ratio
                    break

        # Save updated data
        with open('portfolio_data.json', 'w') as f:
            json.dump(data, f, indent=2)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/holdings/update-ticker-target', methods=['POST'])
def update_ticker_target_endpoint():
    """Update target weight for all holdings of a ticker"""
    try:
        ticker = request.json['ticker']
        new_target = request.json['new_target']

        data = load_portfolio_data()
        holdings = data['holdings']

        # Update all holdings for this ticker
        updated = False
        for holding in holdings:
            if holding['ticker'] == ticker:
                holding['target_weight'] = new_target
                updated = True

        if not updated:
            return jsonify({'error': 'Ticker not found'}), 404

        # Save updated data
        with open('portfolio_data.json', 'w') as f:
            json.dump(data, f, indent=2)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
