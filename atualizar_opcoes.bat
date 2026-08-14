@echo off
chcp 65001 > nul
echo =====================================================
echo  Atualizando Tabela de Opcoes (Margens BTG Pactual)...
echo =====================================================
echo.
cd /d "%~dp0"
python importador_opcoes.py
echo.
echo Concluido! Pressione qualquer tecla para sair.
pause > nul
