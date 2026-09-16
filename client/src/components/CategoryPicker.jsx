export default function CategoryPicker({ value, onChange, options, label = 'Category' }) {
  return (
    <div className="field field-small">
      <label>{label}</label>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
          e.target.value = '';
        }}
      >
        <option value="">Pick a category…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or type your own"
        style={{ marginTop: 6 }}
      />
    </div>
  );
}
