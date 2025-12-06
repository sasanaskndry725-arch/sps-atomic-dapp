// ==================== CONTRACT INTERACTIONS ====================
async function updateContractData() {
    if (!contract || !userAddress || !provider) return;
    
    try {
        logDebug('در حال به‌روزرسانی اطلاعات قرارداد...');
        
        // موجودی کیف پول
        const balance = await provider.getBalance(userAddress);
        document.getElementById('balance').textContent = formatMatic(balance);
        logDebug(`موجودی: ${formatMatic(balance)} MATIC`);
        
        // اطلاعات قرارداد
        try {
            const totalUsers = await contract.totalUsers();
            document.getElementById('totalUsers').textContent = totalUsers.toString();
            logDebug(`کاربران کل: ${totalUsers}`);
        } catch (e) { 
            console.warn('Could not get totalUsers:', e);
            logDebug(`خطا در دریافت totalUsers: ${e.message}`);
        }
        
        try {
            const poolBalance = await contract.poolBalance();
            document.getElementById('poolBalance').textContent = formatMatic(poolBalance);
            logDebug(`موجودی پول: ${formatMatic(poolBalance)} MATIC`);
        } catch (e) { 
            console.warn('Could not get poolBalance:', e);
            logDebug(`خطا در دریافت poolBalance: ${e.message}`);
        }
        
        try {
            const specialPool = await contract.specialRewardPool();
            document.getElementById('specialPool').textContent = formatMatic(specialPool);
            logDebug(`پول ویژه: ${formatMatic(specialPool)} MATIC`);
        } catch (e) { 
            console.warn('Could not get specialPool:', e);
            logDebug(`خطا در دریافت specialPool: ${e.message}`);
        }
        
        try {
            const eligibleUsers = await contract.eligiblePoolUserCount();
            document.getElementById('minerCount').textContent = eligibleUsers.toString();
            logDebug(`ماینرها: ${eligibleUsers}`);
        } catch (e) { 
            console.warn('Could not get eligibleUsers:', e);
            logDebug(`خطا در دریافت eligibleUsers: ${e.message}`);
        }
        
        logDebug('✅ اطلاعات قرارداد به‌روزرسانی شد');
    } catch (error) {
        console.warn('Error updating contract data:', error);
        logDebug(`خطا در به‌روزرسانی: ${error.message}`);
    }
}

async function updateEntryFeeFromContract() {
    if (!contract) return;
    
    try {
        const feeWei = await contract.ENTRY_FEE();
        entryFee = feeWei;
        const feeMatic = ethers.utils.formatEther(feeWei);
        document.getElementById('entryFeeDisplay').textContent = `${parseFloat(feeMatic).toFixed(0)} MATIC`;
        logDebug(`کارمزد ثبت‌نام: ${parseFloat(feeMatic).toFixed(0)} MATIC`);
    } catch (error) {
        console.error('Error getting entry fee:', error);
        document.getElementById('entryFeeDisplay').textContent = '350 MATIC';
        entryFee = ethers.utils.parseEther('350');
        logDebug('استفاده از مقدار پیش‌فرض 350 MATIC');
    }
}

async function checkBalanceForRegistration() {
    if (!provider || !userAddress || !entryFee) return false;
    
    try {
        const balance = await provider.getBalance(userAddress);
        const required = parseFloat(ethers.utils.formatEther(entryFee)) * 1.1; // +10% برای گس
        const hasBalance = parseFloat(ethers.utils.formatEther(balance)) >= required;
        
        if (!hasBalance) {
            showNotification(`❌ موجودی کافی نیست. نیاز: ${required.toFixed(2)} MATIC`, 'error');
            logDebug(`موجودی ناکافی. نیاز: ${required.toFixed(2)}، موجود: ${ethers.utils.formatEther(balance)}`);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error checking balance:', error);
        return false;
    }
}

async function registerUser() {
    if (!isConnected || !contract) {
        showNotification('❌ لطفاً اول کیف پول را متصل کنید', 'error');
        return;
    }
    
    const uplineId = document.getElementById('uplineId').value;
    const position = document.getElementById('position').value === 'true';
    
    if (!uplineId) {
        showNotification('❌ لطفاً آیدی آپلاین را وارد کنید', 'error');
        return;
    }
    
    // بررسی موجودی
    const hasBalance = await checkBalanceForRegistration();
    if (!hasBalance) return;
    
    try {
        const btn = document.getElementById('registerBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<div class="atomic-loader"></div> در حال ثبت‌نام...';
        btn.disabled = true;
        
        showNotification('⏳ ارسال تراکنش ثبت‌نام...', 'info');
        logDebug(`ثبت‌نام با آپلاین: ${uplineId}, موقعیت: ${position}`);
        
        const tx = await contract.register(uplineId, position, {
            value: entryFee,
            gasLimit: 500000
        });
        
        showNotification('✅ تراکنش ارسال شد! منتظر تایید...', 'success');
        logDebug(`تراکنش ارسال شد: ${tx.hash}`);
        
        const receipt = await tx.wait();
        logDebug(`تراکنش تایید شد: ${receipt.transactionHash}`);
        
        showNotification('🎉 ثبت‌نام با موفقیت انجام شد!', 'success');
        document.getElementById('uplineId').value = '';
        await updateContractData();
        
    } catch (error) {
        console.error('Registration error:', error);
        logDebug(`خطای ثبت‌نام: ${error.message}`);
        
        let errorMsg = 'خطا در ثبت‌نام';
        if (error.message.includes('insufficient funds')) {
            errorMsg = 'موجودی کافی نیست';
        } else if (error.message.includes('Upline does not exist')) {
            errorMsg = 'آپلاین وجود ندارد';
        } else if (error.message.includes('User already registered')) {
            errorMsg = 'کاربر قبلاً ثبت‌نام کرده است';
        } else if (error.message.includes('user rejected')) {
            errorMsg = 'کاربر تراکنش را رد کرد';
        }
        
        showNotification(`❌ ${errorMsg}`, 'error');
    } finally {
        const btn = document.getElementById('registerBtn');
        btn.innerHTML = '<i class="fas fa-check-circle"></i> ثبت‌نام در سیستم';
        btn.disabled = false;
    }
}

async function withdrawPool() {
    if (!isConnected || !contract) {
        showNotification('❌ کیف پول متصل نیست', 'error');
        return;
    }
    
    try {
        const btn = document.getElementById('withdrawPoolBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<div class="atomic-loader"></div> در حال برداشت...';
        btn.disabled = true;
        
        showNotification('⏳ در حال برداشت از پول...', 'info');
        logDebug('شروع برداشت از پول');
        
        const isWithdrawable = await contract.isPoolWithdrawable();
        if (!isWithdrawable) {
            throw new Error('پول در حال حاضر قابل برداشت نیست');
        }
        
        const tx = await contract.withdrawPool({ gasLimit: 300000 });
        logDebug(`تراکنش برداشت: ${tx.hash}`);
        
        await tx.wait();
        showNotification('✅ برداشت موفقیت‌آمیز بود!', 'success');
        await updateContractData();
        
    } catch (error) {
        console.error('Withdraw error:', error);
        logDebug(`خطای برداشت: ${error.message}`);
        showNotification(`❌ خطا: ${error.message}`, 'error');
    } finally {
        const btn = document.getElementById('withdrawPoolBtn');
        btn.innerHTML = '<i class="fas fa-money-bill-wave"></i> برداشت از پول';
        btn.disabled = false;
    }
}

async function withdrawSpecial() {
    if (!isConnected || !contract) {
        showNotification('❌ کیف پول متصل نیست', 'error');
        return;
    }
    
    try {
        const btn = document.getElementById('withdrawSpecialBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<div class="atomic-loader"></div> در حال برداشت...';
        btn.disabled = true;
        
        showNotification('⏳ در حال برداشت از پول ویژه...', 'info');
        logDebug('شروع برداشت ویژه');
        
        const tx = await contract.withdrawSpecials({ gasLimit: 300000 });
        logDebug(`تراکنش برداشت ویژه: ${tx.hash}`);
        
        await tx.wait();
        showNotification('✅ برداشت ویژه موفقیت‌آمیز بود!', 'success');
        await updateContractData();
        
    } catch (error) {
        console.error('Special withdraw error:', error);
        logDebug(`خطای برداشت ویژه: ${error.message}`);
        showNotification(`❌ خطا: ${error.message}`, 'error');
    } finally {
        const btn = document.getElementById('withdrawSpecialBtn');
        btn.innerHTML = '<i class="fas fa-crown"></i> برداشت ویژه';
        btn.disabled = false;
    }
}

async function contributeToMiner() {
    const amount = document.getElementById('contributeAmount').value;
    
    if (!amount || parseFloat(amount) <= 0) {
        showNotification('❌ لطفاً مقدار معتبر وارد کنید', 'error');
        return;
    }
    
    if (!isConnected || !contract) {
        showNotification('❌ کیف پول متصل نیست', 'error');
        return;
    }
    
    try {
        const btn = document.getElementById('contributeBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<div class="atomic-loader"></div> در حال ارسال...';
        btn.disabled = true;
        
        const value = ethers.utils.parseEther(amount);
        showNotification(`⏳ در حال ارسال ${amount} MATIC...`, 'info');
        logDebug(`ارسال کمک به ماینر: ${amount} MATIC`);
        
        const tx = await contract.contributeToMinerPool({ 
            value,
            gasLimit: 200000
        });
        
        logDebug(`تراکنش کمک: ${tx.hash}`);
        await tx.wait();
        
        showNotification('✅ کمک شما با موفقیت ثبت شد!', 'success');
        document.getElementById('contributeAmount').value = '';
        await updateContractData();
        
    } catch (error) {
        console.error('Contribution error:', error);
        logDebug(`خطای کمک: ${error.message}`);
        showNotification(`❌ خطا: ${error.message}`, 'error');
    } finally {
        const btn = document.getElementById('contributeBtn');
        btn.innerHTML = '<i class="fas fa-donate"></i> ارسال کمک';
        btn.disabled = false;
    }
}

// Export functions to window object
window.contractFunctions = {
    updateContractData,
    updateEntryFeeFromContract,
    registerUser,
    withdrawPool,
    withdrawSpecial,
    contributeToMiner,
    checkBalanceForRegistration
};
