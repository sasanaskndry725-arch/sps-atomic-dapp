// ==================== GLOBAL VARIABLES ====================
let provider = null;
let signer = null;
let contract = null;
let userAddress = null;
let isConnected = false;
let entryFee = null;

// ==================== HELPER FUNCTIONS ====================
function showNotification(message, type = 'success', duration = 4000) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => notification.classList.remove('show'), duration);
}

function formatAddress(address) {
    if (!address) return '---';
    return address.substring(0, 6) + '...' + address.substring(address.length - 4);
}

function formatMatic(value) {
    if (!value) return '0.00';
    const num = parseFloat(ethers.utils.formatEther(value));
    return num < 0.001 ? '< 0.001' : num.toFixed(3);
}

function logDebug(message) {
    console.log(`[DEBUG] ${message}`);
    const debugPanel = document.getElementById('debugPanel');
    if (debugPanel) {
        debugPanel.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
        debugPanel.scrollTop = debugPanel.scrollHeight;
    }
}

// ==================== SAFEPAL PROVIDER DETECTION ====================
function getEthereumProvider() {
    logDebug('=== شروع تشخیص کیف پول ===');
    
    // نمایش همه object‌های مرتبط برای دیباگ
    const relevantObjects = Object.keys(window).filter(key => {
        const obj = window[key];
        return typeof obj === 'object' && obj !== null && (
            key.toLowerCase().includes('wallet') ||
            key.toLowerCase().includes('ethereum') ||
            key.toLowerCase().includes('web3') ||
            key.toLowerCase().includes('provider') ||
            key.toLowerCase().includes('safepal')
        );
    });
    
    logDebug('Objectهای مرتبط: ' + relevantObjects.join(', '));
    
    // 1. استفاده از window.ethereum (اصلی)
    if (window.ethereum) {
        logDebug('✅ window.ethereum موجود است');
        
        if (window.ethereum.request && typeof window.ethereum.request === 'function') {
            logDebug('✅ window.ethereum معتبر است و متد request دارد');
            return window.ethereum;
        }
    }
    
    // 2. استفاده از safepalProvider
    if (window.safepalProvider) {
        logDebug('✅ window.safepalProvider موجود است');
        
        if (!window.ethereum) {
            window.ethereum = window.safepalProvider;
            logDebug('window.ethereum با safepalProvider تنظیم شد');
        }
        return window.safepalProvider;
    }
    
    // 3. استفاده از safepalwallet (با حروف کوچک)
    if (window.safepalwallet) {
        logDebug('✅ window.safepalwallet (حروف کوچک) موجود است');
        
        if (!window.ethereum) {
            window.ethereum = window.safepalwallet;
            logDebug('window.ethereum با safepalwallet تنظیم شد');
        }
        return window.safepalwallet;
    }
    
    // 4. استفاده از web3.currentProvider
    if (window.web3 && window.web3.currentProvider) {
        logDebug('✅ window.web3.currentProvider موجود است');
        if (!window.ethereum) {
            window.ethereum = window.web3.currentProvider;
            logDebug('window.ethereum با web3.currentProvider تنظیم شد');
        }
        return window.web3.currentProvider;
    }
    
    logDebug('❌ هیچ provider معتبری پیدا نشد');
    return null;
}

// ==================== NETWORK MANAGEMENT ====================
async function ensurePolygonNetwork() {
    try {
        if (!window.ethereum || !window.ethereum.request) {
            throw new Error('Provider شبکه موجود نیست');
        }
        
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        logDebug(`شناسه شبکه فعلی: ${chainId} (${parseInt(chainId)})`);
        
        if (chainId === '0x89') {
            logDebug('✅ شبکه Polygon فعال است');
            return true;
        }
        
        showNotification('⚠️ در حال تغییر به شبکه Polygon...', 'warning');
        logDebug('تلاش برای تغییر به شبکه Polygon...');
        
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x89' }]
            });
            logDebug('✅ شبکه با موفقیت تغییر کرد');
            showNotification('✅ شبکه Polygon فعال شد', 'success');
            return true;
        } catch (switchError) {
            if (switchError.code === 4902) {
                logDebug('شبکه Polygon وجود ندارد، در حال اضافه کردن...');
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [window.AppConfig.NETWORK_CONFIG]
                });
                logDebug('✅ شبکه Polygon اضافه شد');
                showNotification('✅ شبکه Polygon اضافه شد', 'success');
                return true;
            } else {
                logDebug(`خطا در تغییر شبکه: ${switchError.message}`);
                throw new Error(`تغییر شبکه ناموفق: ${switchError.message}`);
            }
        }
    } catch (error) {
        logDebug(`خطا در مدیریت شبکه: ${error.message}`);
        throw error;
    }
}

// ==================== WALLET CONNECTION ====================
async function connectWallet() {
    try {
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.innerHTML = '<div class="atomic-loader"></div> در حال اتصال...';
        connectBtn.disabled = true;
        
        logDebug('=== شروع فرآیند اتصال ===');
        
        // 1. تشخیص کیف پول
        const ethereumProvider = getEthereumProvider();
        if (!ethereumProvider) {
            showNotification('❌ کیف پول یافت نشد', 'error');
            resetConnectButton();
            return;
        }
        
        logDebug('Provider شناسایی شد: ' + ethereumProvider.constructor.name);
        
        // 2. بررسی متدهای لازم
        if (!ethereumProvider.request || typeof ethereumProvider.request !== 'function') {
            logDebug('❌ Provider فاقد متد request است');
            throw new Error('این کیف پول از استاندارد EIP-1193 پشتیبانی نمی‌کند');
        }
        
        // 3. بررسی اینکه آیا قبلاً متصل است
        try {
            const currentAccounts = await ethereumProvider.request({ method: 'eth_accounts' });
            logDebug(`حساب‌های فعلی: ${currentAccounts.length}`);
            
            if (currentAccounts.length > 0) {
                userAddress = currentAccounts[0];
                logDebug(`✅ از قبل متصل به: ${userAddress}`);
                
                // مستقیماً به مرحله تنظیم provider برو
                await setupProviderAndContract(ethereumProvider);
                return;
            }
        } catch (e) {
            logDebug(`خطا در eth_accounts: ${e.message}`);
        }
        
        // 4. درخواست اتصال جدید
        logDebug('درخواست اتصال جدید...');
        showNotification('⌛ لطفاً در کیف پول تأیید کنید', 'info');
        
        let accounts;
        try {
            accounts = await ethereumProvider.request({ 
                method: 'eth_requestAccounts'
            });
            logDebug(`پاسخ eth_requestAccounts: ${accounts.length} حساب`);
        } catch (requestError) {
            logDebug(`❌ خطا در eth_requestAccounts: ${requestError.message}`);
            logDebug(`کد خطا: ${requestError.code}`);
            
            if (requestError.code === 4001 || requestError.code === -32603) {
                throw new Error('کاربر درخواست اتصال را رد کرد');
            } else if (requestError.message.includes('already pending')) {
                throw new Error('یک درخواست اتصال در حال پردازش است');
            } else {
                throw requestError;
            }
        }
        
        if (!accounts || accounts.length === 0) {
            throw new Error('هیچ حسابی انتخاب نشد');
        }
        
        userAddress = accounts[0];
        logDebug(`✅ متصل به: ${userAddress}`);
        
        // 5. تنظیم provider و contract
        await setupProviderAndContract(ethereumProvider);
        
    } catch (error) {
        console.error('خطای اتصال:', error);
        logDebug(`❌ خطای اتصال: ${error.message}`);
        
        let errorMsg = 'خطا در اتصال';
        if (error.message.includes('رد کرد') || error.code === 4001) {
            errorMsg = 'اتصال توسط کاربر رد شد';
        } else if (error.message.includes('pending')) {
            errorMsg = 'لطفاً صبر کنید، درخواست قبلی در حال پردازش است';
        } else if (error.message.includes('EIP-1193')) {
            errorMsg = 'کیف پول از استاندارد لازم پشتیبانی نمی‌کند';
        }
        
        showNotification(`❌ ${errorMsg}`, 'error');
        resetConnectButton();
    }
}

// ==================== SETUP PROVIDER AND CONTRACT ====================
async function setupProviderAndContract(ethereumProvider) {
    try {
        logDebug('=== تنظیم Provider و Contract ===');
        
        // 1. تنظیم window.ethereum برای سازگاری
        window.ethereum = ethereumProvider;
        
        // 2. ایجاد provider اترز
        provider = new ethers.providers.Web3Provider(ethereumProvider);
        logDebug('✅ Provider اترز ایجاد شد');
        
        // 3. دریافت signer
        signer = provider.getSigner();
        
        // 4. دریافت آدرس signer برای تأیید
        try {
            const signerAddress = await signer.getAddress();
            logDebug(`✅ آدرس Signer: ${signerAddress}`);
            
            if (signerAddress.toLowerCase() !== userAddress.toLowerCase()) {
                logDebug(`⚠️ هشدار: آدرس signer با آدرس کاربر متفاوت است`);
            }
        } catch (signerError) {
            logDebug(`⚠️ خطا در دریافت آدرس signer: ${signerError.message}`);
        }
        
        // 5. ایجاد contract
        contract = new ethers.Contract(
            window.AppConfig.CONTRACT_ADDRESS, 
            window.AppConfig.CONTRACT_ABI, 
            signer
        );
        logDebug('✅ Contract ایجاد شد');
        
        // 6. بررسی شبکه (اختیاری)
        try {
            const chainId = await ethereumProvider.request({ method: 'eth_chainId' });
            logDebug(`شبکه فعلی: ${chainId} (${parseInt(chainId)})`);
            
            if (chainId !== '0x89') {
                logDebug('⚠️ شبکه Polygon نیست، اما ادامه می‌دهیم');
                showNotification('⚠️ شبکه Polygon نیست، اما اتصال برقرار شد', 'warning');
            } else {
                logDebug('✅ شبکه Polygon فعال است');
            }
        } catch (networkError) {
            logDebug(`⚠️ خطا در بررسی شبکه: ${networkError.message}`);
        }
        
        // 7. نمایش اطلاعات در UI
        document.getElementById('walletPanel').style.display = 'block';
        document.getElementById('walletAddress').textContent = userAddress;
        document.getElementById('status').textContent = 'متصل';
        document.getElementById('status').style.color = 'var(--secondary)';
        
        // 8. به‌روزرسانی دکمه
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.innerHTML = '<i class="fas fa-check"></i> <span>متصل شد</span>';
        connectBtn.style.background = 'linear-gradient(135deg, var(--secondary), #34d399)';
        
        // 9. دریافت اطلاعات قرارداد
        await updateContractData();
        await updateEntryFeeFromContract();
        
        // 10. نمایش پیام موفقیت
        showNotification('🎉 اتصال موفقیت‌آمیز!', 'success');
        isConnected = true;
        logDebug('=== اتصال کامل شد ===');
        
        // 11. تنظیم event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('خطا در تنظیم provider:', error);
        logDebug(`❌ خطا در setupProviderAndContract: ${error.message}`);
        throw error;
    }
}

function resetConnectButton() {
    const connectBtn = document.getElementById('connectBtn');
    connectBtn.innerHTML = '<i class="fas fa-wallet"></i> اتصال کیف پول';
    connectBtn.style.background = 'var(--gradient-primary)';
    connectBtn.disabled = false;
}

function disconnectWallet() {
    document.getElementById('walletPanel').style.display = 'none';
    const connectBtn = document.getElementById('connectBtn');
    connectBtn.innerHTML = '<i class="fas fa-wallet"></i> اتصال کیف پول';
    connectBtn.style.background = 'var(--gradient-primary)';
    connectBtn.disabled = false;
    
    provider = null;
    signer = null;
    contract = null;
    userAddress = null;
    isConnected = false;
    
    showNotification('🔌 کیف پول قطع شد', 'info');
    logDebug('کیف پول قطع شد');
}

function setupEventListeners() {
    if (!window.ethereum) return;
    
    window.ethereum.on('accountsChanged', (newAccounts) => {
        logDebug(`تغییر حساب: ${newAccounts.length} حساب`);
        if (newAccounts.length > 0) {
            userAddress = newAccounts[0];
            document.getElementById('walletAddress').textContent = userAddress;
            updateContractData();
            showNotification('🔄 حساب کاربری تغییر کرد', 'info');
        } else {
            disconnectWallet();
        }
    });
    
    window.ethereum.on('chainChanged', (chainId) => {
        logDebug(`تغییر شبکه: ${chainId}`);
        if (chainId === '0x89') {
            showNotification('✅ شبکه Polygon فعال شد', 'success');
            setTimeout(() => updateContractData(), 1000);
        } else {
            showNotification('⚠️ لطفاً به شبکه Polygon برگردید', 'warning');
        }
    });
}

// ==================== تابع تشخیص کیف پول ====================
function testWalletDetection() {
    const resultDiv = document.getElementById('walletTestResult');
    resultDiv.innerHTML = '<div style="text-align: center; color: #f59e0b;"><div class="atomic-loader" style="width: 16px; height: 16px; display: inline-block;"></div> در حال بررسی...</div>';
    
    setTimeout(() => {
        let html = '<div style="text-align: right;">';
        
        // بررسی وجود objectهای اصلی
        const checks = [
            { name: 'window.ethereum', exists: !!window.ethereum, object: window.ethereum },
            { name: 'window.safepalProvider', exists: !!window.safepalProvider, object: window.safepalProvider },
            { name: 'window.safepalwallet', exists: !!window.safepalwallet, object: window.safepalwallet },
            { name: 'window.web3', exists: !!window.web3, object: window.web3 },
            { name: 'window.safepal', exists: !!window.safepal, object: window.safepal },
        ];
        
        checks.forEach(check => {
            if (check.exists) {
                html += `<div style="color: #10b981; margin-bottom: 5px;">
                    <i class="fas fa-check-circle"></i> ${check.name} پیدا شد`;
                
                // بررسی متد request
                if (check.object && check.object.request && typeof check.object.request === 'function') {
                    html += ' <span style="color: #60a5fa;">(دارای متد request)</span>';
                } else {
                    html += ' <span style="color: #f59e0b;">(فاقد متد request)</span>';
                }
                
                html += '</div>';
            } else {
                html += `<div style="color: #ef4444; margin-bottom: 5px;">
                    <i class="fas fa-times-circle"></i> ${check.name} پیدا نشد
                </div>`;
            }
        });
        
        // تست eth_accounts اگر ethereum وجود دارد
        if (window.ethereum && window.ethereum.request) {
            html += '<div style="margin-top: 15px; color: #60a5fa;">در حال بررسی حساب‌ها...</div>';
            
            window.ethereum.request({ method: 'eth_accounts' })
                .then(accounts => {
                    let accountsHtml = '';
                    if (accounts.length > 0) {
                        accountsHtml = `<div style="color: #10b981; margin-top: 10px;">
                            <i class="fas fa-user-check"></i> حساب‌های فعال: ${accounts.length}
                            <div style="font-size: 10px; word-break: break-all; margin-top: 5px;">${accounts[0]}</div>
                        </div>`;
                    } else {
                        accountsHtml = `<div style="color: #f59e0b; margin-top: 10px;">
                            <i class="fas fa-user-times"></i> هیچ حساب فعالی پیدا نشد
                        </div>`;
                    }
                    resultDiv.innerHTML += accountsHtml;
                })
                .catch(err => {
                    resultDiv.innerHTML += `<div style="color: #ef4444; margin-top: 10px;">
                        <i class="fas fa-exclamation-triangle"></i> خطا در دریافت حساب‌ها: ${err.message}
                    </div>`;
                });
            
            // تست chainId
            window.ethereum.request({ method: 'eth_chainId' })
                .then(chainId => {
                    resultDiv.innerHTML += `<div style="color: #60a5fa; margin-top: 10px;">
                        <i class="fas fa-network-wired"></i> Chain ID: ${chainId} (${parseInt(chainId)})
                    </div>`;
                })
                .catch(err => {
                    resultDiv.innerHTML += `<div style="color: #ef4444; margin-top: 10px;">
                        <i class="fas fa-exclamation-triangle"></i> خطا در دریافت Chain ID: ${err.message}
                    </div>`;
                });
        }
        
        html += '</div>';
        resultDiv.innerHTML = html;
    }, 300);
}

// ==================== تابع اتصال فوری (برای تست) ====================
async function quickConnectTest() {
    try {
        logDebug('=== تست اتصال سریع ===');
        
        // مستقیماً از window.ethereum استفاده کن
        if (!window.ethereum) {
            showNotification('❌ window.ethereum موجود نیست', 'error');
            return;
        }
        
        // تست eth_requestAccounts مستقیماً
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        if (accounts.length > 0) {
            userAddress = accounts[0];
            logDebug(`✅ مستقیماً متصل شد به: ${userAddress}`);
            
            // مستقیماً UI رو آپدیت کن
            document.getElementById('walletPanel').style.display = 'block';
            document.getElementById('walletAddress').textContent = userAddress;
            document.getElementById('status').textContent = 'متصل';
            document.getElementById('status').style.color = 'var(--secondary)';
            
            showNotification('✅ اتصال سریع موفق!', 'success');
            
            // provider و contract رو هم تنظیم کن
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            contract = new ethers.Contract(
                window.AppConfig.CONTRACT_ADDRESS, 
                window.AppConfig.CONTRACT_ABI, 
                signer
            );
            isConnected = true;
            
            await updateContractData();
        }
        
    } catch (error) {
        console.error('خطا در تست سریع:', error);
        showNotification(`❌ خطا در تست سریع: ${error.message}`, 'error');
    }
}

// Export functions to window object
window.walletFunctions = {
    connectWallet,
    disconnectWallet,
    testWalletDetection,
    quickConnectTest,
    getEthereumProvider,
    ensurePolygonNetwork,
    showNotification,
    formatAddress,
    formatMatic,
    logDebug
};
