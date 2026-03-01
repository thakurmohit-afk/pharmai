import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { ShieldCheck, CreditCard, Smartphone, Landmark, Zap, AlertTriangle } from 'lucide-react';

const METHODS = [
    { id: 'upi', label: 'UPI', Icon: Smartphone },
    { id: 'card', label: 'Card', Icon: CreditCard },
    { id: 'netbanking', label: 'Net Banking', Icon: Landmark },
];

export default function PaymentCard({ orderData, onPaymentSuccess, safetyWarning }) {
    const { amount, currency, razorpay_order_id, key_id } = orderData;
    const [selectedMethod, setSelectedMethod] = useState('upi');
    const [isProcessing, setIsProcessing] = useState(false);

    // Load Razorpay script dynamically
    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
        return () => {
            document.body.removeChild(script);
        };
    }, []);

    const handlePay = () => {
        if (!window.Razorpay) return;
        setIsProcessing(true);

        const methodConfig =
            selectedMethod === 'upi'
                ? { upi: true }
                : selectedMethod === 'card'
                    ? { card: true }
                    : { netbanking: true };

        const options = {
            key: key_id,
            amount: amount * 100,
            currency: currency,
            name: 'PharmAI',
            description: 'Medicine Order',
            order_id: razorpay_order_id,
            method: methodConfig,
            handler: function (response) {
                onPaymentSuccess({
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_signature: response.razorpay_signature,
                    payment_method: selectedMethod,
                });
                setIsProcessing(false);
            },
            prefill: {
                name: 'PharmAI User',
                contact: '9999999999',
                email: 'user@example.com',
            },
            theme: { color: '#10b981' },
            modal: {
                ondismiss: function () {
                    setIsProcessing(false);
                },
            },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
    };

    const qrValue = `upi://pay?pa=pharmacy@razorpay&pn=PharmAI&tr=${razorpay_order_id}&tn=Order-${razorpay_order_id.slice(-4)}&am=${amount}&cu=INR`;

    return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden w-full max-w-sm mt-2">
            {/* Header */}
            <div className="bg-emerald-600/20 p-4 border-b border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="text-emerald-400" size={20} />
                    <span className="font-semibold text-emerald-100">Secure Payment</span>
                </div>
                <span className="text-xs text-emerald-300 bg-emerald-900/50 px-2 py-1 rounded-full">
                    Razorpay
                </span>
            </div>

            <div className="p-5 flex flex-col items-center gap-4">
                {/* Safety Warning Banner */}
                {safetyWarning && (
                    <div className="w-full bg-danger-500/10 border border-danger-500/30 rounded-lg p-3 flex items-start gap-2 mb-2 animate-pulse">
                        <AlertTriangle className="text-danger-400 shrink-0 mt-0.5" size={16} />
                        <p className="text-sm font-medium text-danger-200 leading-snug">
                            {safetyWarning}
                        </p>
                    </div>
                )}

                {/* Method selector */}
                <div className="flex gap-2 w-full">
                    {METHODS.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => setSelectedMethod(id)}
                            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors ${selectedMethod === id
                                    ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                                    : 'border-slate-600 bg-slate-700/40 text-slate-400 hover:border-slate-500'
                                }`}
                        >
                            <Icon size={16} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* UPI QR — only shown when UPI selected */}
                {selectedMethod === 'upi' && (
                    <>
                        <div className="bg-white p-3 rounded-xl shadow-lg">
                            <QRCodeCanvas value={qrValue} size={140} />
                        </div>
                        <p className="text-xs text-slate-400 text-center">
                            Scan with any UPI app<br />(GPay, PhonePe, Paytm)
                        </p>
                        <a
                            href={qrValue}
                            className="text-xs text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
                        >
                            Open UPI link
                        </a>
                    </>
                )}

                {selectedMethod === 'card' && (
                    <p className="text-sm text-slate-300 text-center py-2">
                        You'll be prompted to enter your card details on the next screen.
                    </p>
                )}

                {selectedMethod === 'netbanking' && (
                    <p className="text-sm text-slate-300 text-center py-2">
                        Select your bank on the next screen to complete payment.
                    </p>
                )}

                <div className="w-full h-px bg-slate-700/50" />

                {/* Amount */}
                <div className="text-center">
                    <p className="text-slate-400 text-sm">Total Amount</p>
                    <p className="text-2xl font-bold text-white">₹{amount.toFixed(2)}</p>
                </div>

                {/* Pay Button */}
                <button
                    onClick={handlePay}
                    disabled={isProcessing}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isProcessing ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <Zap size={18} />
                            Pay via {METHODS.find(m => m.id === selectedMethod)?.label}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
