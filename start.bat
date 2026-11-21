@echo off
cd /d "%~dp0"
start "" http://localhost:8800
python devserver.py 8800
