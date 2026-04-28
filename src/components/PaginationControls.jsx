const PaginationControls = ({
  page,
  totalPages,
  total,
  canPrev,
  canNext,
  disabled = false,
  onPrev,
  onNext,
}) => {
  if (!total) {
    return null;
  }

  return (
    <div className="pagination-controls">
      <button
        type="button"
        className="pagination-button"
        disabled={disabled || !canPrev}
        onClick={onPrev}
      >
        上一页
      </button>
      <div className="pagination-summary">
        <strong>{page}</strong>
        <span>/ {totalPages} 页</span>
        <p>共 {total} 条</p>
      </div>
      <button
        type="button"
        className="pagination-button"
        disabled={disabled || !canNext}
        onClick={onNext}
      >
        下一页
      </button>
    </div>
  );
};

export default PaginationControls;
