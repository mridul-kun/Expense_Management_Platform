const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

// ---- Fill these in with your actual values from Google Cloud Console ----
const GOOGLE_CLIENT_ID = '';
const GOOGLE_CLIENT_SECRET = '';
// ---------------------------------------------------------------------

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'build', 'icon.ico'),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'app', 'Index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ---- Google login flow ----
ipcMain.handle('google-login', async () => {
    return new Promise((resolve, reject) => {
        let port; // declared outside so both functions below can see it

        const server = http.createServer(async (req, res) => {
            if (!req.url.startsWith('/callback')) return;

            const url = new URL(req.url, 'http://localhost');
            const code = url.searchParams.get('code');

            res.end('<h2>Login successful. You can close this tab and return to XpFlow.</h2>');
            server.close();

            if (!code) {
                reject(new Error('No authorization code received'));
                return;
            }

            try {
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        code,
                        client_id: GOOGLE_CLIENT_ID,
                        client_secret: GOOGLE_CLIENT_SECRET,
                        redirect_uri: `http://localhost:${port}/callback`,
                        grant_type: 'authorization_code'
                    })
                });
                const tokenData = await tokenRes.json();

                if (!tokenData.access_token) {
                    reject(new Error('Token exchange failed: ' + JSON.stringify(tokenData)));
                    return;
                }

                const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenData.access_token}` }
                });
                const userInfo = await userRes.json();

                resolve({ email: userInfo.email, name: userInfo.name });
            } catch (err) {
                reject(err);
            }
        });

        server.listen(0, '127.0.0.1', () => {
            port = server.address().port; // no "const" here anymore — assigns the outer variable
            const state = crypto.randomBytes(16).toString('hex');

            const authUrl =
                `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${GOOGLE_CLIENT_ID}` +
                `&redirect_uri=http://localhost:${port}/callback` +
                `&response_type=code` +
                `&scope=email%20profile` +
                `&state=${state}`;

            shell.openExternal(authUrl);
        });
    });
});