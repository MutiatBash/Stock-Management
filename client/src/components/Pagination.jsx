export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  let display = [];
  if (totalPages <= 7) {
    display = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    display.push(1);
    if (currentPage > 3) display.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      display.push(i);
    }
    if (currentPage < totalPages - 2) display.push('...');
    display.push(totalPages);
  }

  return (
    <div className="pagination">
      <button
        type="button"
        className={`page-btn ${currentPage === 1 ? 'page-btn-disabled' : ''}`}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
      >
        &lsaquo;
      </button>
      {display.map((p, idx) =>
        p === '...' ? (
          <span key={`ellipsis-${idx}`} className="page-ellipsis">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`page-btn ${p === currentPage ? 'page-btn-active' : ''}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className={`page-btn ${currentPage === totalPages ? 'page-btn-disabled' : ''}`}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
      >
        &rsaquo;
      </button>
    </div>
  );
}
