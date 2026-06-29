#!/usr/bin/env python3
"""Simple Flask app for demo"""
from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route('/')
def hello():
    return jsonify({
        'message': 'Hello from EKS!',
        'version': os.environ.get('APP_VERSION', '1.0.0'),
        'env': os.environ.get('SPRING_PROFILES_ACTIVE', 'dev')
    })

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

@app.route('/ready')
def ready():
    return jsonify({'status': 'ready'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
