import React from 'react';

const AddScheduleForm = ({ days, onAddClass }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const newClassInfo = {
      title: form.elements.title.value.trim(),
      checkedDays: Array.from(form.elements.days)
        .filter((d) => d.checked)
        .map((d) => d.value),
      start: form.elements.start.value,
      end: form.elements.end.value,
    };
    onAddClass(newClassInfo);
    form.reset();
  };

  return (
    <form onSubmit={handleSubmit} className="add-form">
      <input name="title" placeholder="과목명" required />
      <div className="days-checkbox">
        {days.map((d) => (
          <label key={d}>
            <input type="checkbox" name="days" value={d} /> {d}
          </label>
        ))}
      </div>
      <input type="time" name="start" min="08:00" max="23:00" required />
      <input type="time" name="end" min="08:00" max="23:00" required />
      <button type="submit">추가</button>
    </form>
  );
};

export default AddScheduleForm;
