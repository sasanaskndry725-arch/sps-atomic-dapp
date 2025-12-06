// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 SPS Matrix Atomic DApp v2.1 Initialized');
    logDebug('برنامه راه‌اندازی شد');
    
    // فعال کردن پنل دیباگ در حالت توسعه
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        document.getElementById('debugPanel').style.display = 'block';
    }
    
    // راه‌اندازی پس‌زمینه 3D
    init3DGalaxy();
    
    // اتصال event listeners
    document.getElementById('connectBtn').addEventListener('click', connectWallet);
    document.getElementById('disconnectBtn').addEventListener('click', disconnectWallet);
    document.getElementById('registerBtn').addEventListener('click', registerUser);
    document.getElementById('withdrawPoolBtn').addEventListener('click', withdrawPool);
    document.getElementById('withdrawSpecialBtn').addEventListener('click', withdrawSpecial);
    document.getElementById('contributeBtn').addEventListener('click', contributeToMiner);
    
    // بررسی اتصال خودکار
    setTimeout(async () => {
        const ethereumProvider = getEthereumProvider();
        if (ethereumProvider) {
            try {
                const accounts = await ethereumProvider.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    logDebug('اتصال خودکار با حساب موجود');
                    setTimeout(() => connectWallet(), 500);
                }
            } catch (error) {
                console.warn('Auto-connect error:', error);
            }
        }
    }, 1000);
    
    // خوش‌آمدگویی
    setTimeout(() => {
        showNotification('🚀 به دی‌اپ اتمی SPS MATRIX خوش آمدید!', 'info', 3000);
    }, 1500);
});
