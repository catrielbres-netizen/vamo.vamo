call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
call npx firebase deploy --only hosting
