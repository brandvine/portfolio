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
    reimport_from_csv, load_portfolio_data, refresh_prices,
    update_holding_price, save_portfolio_data, DATA_FILE
)
from price_service import get_price_source, get_price_url
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
    """Reimport data from uploaded CSV file"""
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if not file.filename.endswith('.csv'):
            return jsonify({'error': 'File must be a CSV'}), 400

        # Save the uploaded file temporarily
        import tempfile
        import os

        # Create a temporary file
        fd, temp_path = tempfile.mkstemp(suffix='.csv')
        try:
            # Save uploaded file to temp location
            file.save(temp_path)

            # Import from the temp file
            holdings_count, accounts_count = reimport_from_csv(temp_path)

            return jsonify({
                'success': True,
                'holdings_count': holdings_count,
                'accounts_count': accounts_count
            })
        finally:
            # Clean up temp file
            os.close(fd)
            os.unlink(temp_path)

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

        # Recalculate current_weight for all holdings based on new total value
        for h in holdings_data:
            h['current_weight'] = (h['current_value'] / total_value * 100) if total_value > 0 else 0

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

        # Add raw holdings data for the table (now with recalculated weights)
        results['holdings'] = holdings_data

        # Add cash target
        results['cash_target_percentage'] = cash_target_percentage

        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/holdings/update-ticker-value', methods=['POST'])
def update_ticker_value_endpoint():
    """Update value for a ticker - either by new total value or new per-unit price"""
    try:
        ticker = request.json['ticker']
        new_value = request.json.get('new_value')
        new_price = request.json.get('new_price')

        data = load_portfolio_data()
        holdings = data['holdings']

        # Find all holdings for this ticker
        ticker_holdings = [h for h in holdings if h['ticker'] == ticker]

        if not ticker_holdings:
            return jsonify({'error': 'Ticker not found'}), 404

        from datetime import datetime
        now = datetime.now().isoformat()

        if new_price is not None:
            # Update by per-unit price - recalculate values for all accounts
            for holding in ticker_holdings:
                for i, h in enumerate(holdings):
                    if (h['ticker'] == holding['ticker'] and
                        h['account'] == holding['account'] and
                        h['owner'] == holding['owner']):
                        holdings[i]['last_price'] = new_price
                        holdings[i]['current_value'] = holdings[i]['quantity'] * new_price
                        # Recalculate P/L
                        book_cost = holdings[i].get('book_cost', 0)
                        if book_cost > 0:
                            holdings[i]['pl_pct'] = round(
                                (holdings[i]['current_value'] - book_cost) / book_cost * 100, 2
                            )
                        holdings[i]['price_updated'] = now
                        break
        elif new_value is not None:
            # Update by total value - proportionally adjust
            current_total = sum(h['current_value'] for h in ticker_holdings)

            if current_total == 0:
                return jsonify({'error': 'Cannot update zero-value holding'}), 400

            ratio = new_value / current_total

            for holding in ticker_holdings:
                for i, h in enumerate(holdings):
                    if (h['ticker'] == holding['ticker'] and
                        h['account'] == holding['account'] and
                        h['owner'] == holding['owner']):
                        holdings[i]['current_value'] = holding['current_value'] * ratio
                        # Update last_price based on new value
                        qty = holdings[i].get('quantity', 1)
                        if qty > 0:
                            holdings[i]['last_price'] = holdings[i]['current_value'] / qty
                        # Recalculate P/L
                        book_cost = holdings[i].get('book_cost', 0)
                        if book_cost > 0:
                            holdings[i]['pl_pct'] = round(
                                (holdings[i]['current_value'] - book_cost) / book_cost * 100, 2
                            )
                        holdings[i]['price_updated'] = now
                        break

        # Save updated data
        save_portfolio_data(data)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/refresh-prices', methods=['POST'])
def refresh_prices_endpoint():
    """Fetch live prices from Yahoo Finance and update holdings"""
    try:
        results = refresh_prices()
        return jsonify({
            'success': True,
            'updated': len(results),
            'prices': results
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/price-sources')
def price_sources_endpoint():
    """Get price source info for all holdings"""
    try:
        data = load_portfolio_data()
        tickers = list(set(h['ticker'] for h in data['holdings']))
        sources = {}
        for t in tickers:
            source = get_price_source(t)
            url = get_price_url(t)
            if source:
                sources[t] = {'source': source, 'url': url}
            else:
                sources[t] = {'source': 'Manual', 'url': None}
        return jsonify(sources)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/holdings/update-price', methods=['POST'])
def update_price_endpoint():
    """Manually update per-unit price for a holding"""
    try:
        data = request.json
        success = update_holding_price(
            data['ticker'],
            data['account'],
            data['owner'],
            data['price']
        )
        return jsonify({'success': success})
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
        save_portfolio_data(data)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('RAILWAY_ENVIRONMENT') is None
    app.run(debug=debug, host='0.0.0.0', port=port)
