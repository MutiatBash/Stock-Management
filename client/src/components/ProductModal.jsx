import Alert from './Alert';
import CategoryPicker from './CategoryPicker';

const CATEGORY_OPTIONS = [
    'Charger',
    'Cable',
    'Adapter',
    'Pouch',
    'Laptop Bag',
    'Screen Guard',
    'Keyboard',
    'Mouse',
    'Headset',
    'Speaker',
    'Battery',
    'Memory (RAM)',
    'Storage (SSD/HDD)',
    'Cooling Pad',
    'Flash Drive',
    'Other Accessory',
];

export default function ProductModal({
    open,
    form,
    setForm,
    onClose,
    onSubmit,
    error,
    isEditing,
}) {
    if (!open) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="modal-box product-modal">
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title">
                            {isEditing ? 'Edit Product' : 'Set Up a New Product'}
                        </h3>
                        <p className="modal-subtitle">
                            {isEditing
                                ? 'Update the details for this product.'
                                : 'Add a product to your inventory.'}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <Alert type="error" message={error} />

                <form onSubmit={onSubmit} className="add-item-form">
                    <div className="field">
                        <label>Product name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) =>
                                setForm({ ...form, name: e.target.value })
                            }
                            placeholder="e.g. Type-C Fast Charger 65W"
                            required
                        />
                    </div>

                    <div className="field field-small">
                        <label>SKU / code (optional)</label>
                        <input
                            type="text"
                            value={form.sku}
                            onChange={(e) =>
                                setForm({ ...form, sku: e.target.value })
                            }
                            placeholder="e.g. TS38790"
                        />
                    </div>

                    <CategoryPicker
                        value={form.category}
                        onChange={(value) =>
                            setForm({ ...form, category: value })
                        }
                        options={CATEGORY_OPTIONS}
                    />

                    <div className="field field-wide">
                        <label>Description</label>
                        <input
                            type="text"
                            value={form.description}
                            onChange={(e) =>
                                setForm({ ...form, description: e.target.value })
                            }
                            placeholder="Any extra details"
                        />
                    </div>

                    {!isEditing && (
                        <div className="field field-small">
                            <label>How many do you have now?</label>
                            <input
                                type="number"
                                min="0"
                                value={form.quantity}
                                onChange={(e) =>
                                    setForm({ ...form, quantity: e.target.value })
                                }
                                required
                            />
                        </div>
                    )}

                    <div className="field field-small">
                        <label>Warn me when stock drops to</label>
                        <input
                            type="number"
                            min="0"
                            value={form.low_stock_level}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    low_stock_level: e.target.value,
                                })
                            }
                            required
                        />
                    </div>

                    <div className="field field-small">
                        <label>Cost price (₦)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.cost_price}
                            onChange={(e) =>
                                setForm({ ...form, cost_price: e.target.value })
                            }
                        />
                    </div>

                    <div className="field field-small">
                        <label>Selling price (₦)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.price}
                            onChange={(e) =>
                                setForm({ ...form, price: e.target.value })
                            }
                        />
                    </div>

                    <div className="field field-small">
                        <label>VAT rate (%)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.vat_rate}
                            onChange={(e) =>
                                setForm({ ...form, vat_rate: e.target.value })
                            }
                        />
                    </div>

                    {isEditing && (
                        <p className="hint-text">
                            To change how many are in stock, use "+ Stock" on the
                            Products page instead.
                        </p>
                    )}

                    <div className="modal-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </button>

                        <button type="submit" className="btn btn-primary">
                            {isEditing ? 'Save Changes' : 'Add Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}