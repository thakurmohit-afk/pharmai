import React from 'react';

function formatInr(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function OrderSummaryCard({ quote }) {
    if (!quote || quote.quantity_status !== 'resolved' || !Array.isArray(quote.lines) || quote.lines.length === 0) {
        return null;
    }

    return (
        <div className="mt-2 w-full max-w-md rounded-xl border border-surface-700/40 bg-surface-900/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-300">Order Summary</p>

            {quote.conversion_note && (
                <p className="mt-2 text-xs text-amber-300/90">{quote.conversion_note}</p>
            )}

            <div className="mt-2 space-y-2">
                {quote.lines.map((line, index) => (
                    <div key={`${line.medicine_id || line.name}-${index}`} className="rounded-lg bg-surface-800/40 p-2 text-xs">
                        <p className="font-medium text-white">{line.name}</p>
                        <p className="mt-1 text-surface-200/70">
                            Requested: {line.requested_qty} {line.requested_unit}
                            {line.requested_unit === 'tablet' ? ` (strip size: ${line.strip_size})` : ''}
                        </p>
                        <p className="text-surface-200/70">
                            Billing: {line.billing_qty} strips x Rs.{formatInr(line.unit_price)}
                        </p>
                        <p className="mt-1 text-primary-300">Subtotal: Rs.{formatInr(line.subtotal)}</p>
                    </div>
                ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-surface-700/40 pt-2">
                <span className="text-xs text-surface-200/70">Total</span>
                <span className="text-sm font-semibold text-white">Rs.{formatInr(quote.total_amount)}</span>
            </div>
        </div>
    );
}
