const PaginationControls = ({
  totalPages,
  canPrev,
  canNext,
  disabled = false,
  onPrev,
  onNext,
}) => {
  if (!totalPages) {
    return null;
  }

  return (
    <div className="pagination-controls">
      <button
        type="button"
        className="pagination-button"
        aria-label="上一页"
        disabled={disabled || !canPrev}
        onClick={onPrev}
      >
        ‹
      </button>
      <button
        type="button"
        className="pagination-button"
        aria-label="下一页"
        disabled={disabled || !canNext}
        onClick={onNext}
      >
        ›
      </button>
    </div>
  );
};

export default PaginationControls;
