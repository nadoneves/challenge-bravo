
const format2float = (amount) => {
    amount = amount.toString();
    const commaIndex = amount.indexOf(',');
    const dotIndex = amount.indexOf('.');

    if(commaIndex < dotIndex) amount = amount.replace(/\,/g, '');
    else amount = amount.replace(/\./g, '').replace(',', '.');
    
    return parseFloat(amount);
};

const formatCurrency = (amount, currency = 'USD') => {
    amount = format2float(amount);
    try {
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: currency, minimumFractionDigits: 10 });
    } catch (error) {
        return "$ " + amount;
    }
};

module.exports = {
    format2float,
    formatCurrency
};