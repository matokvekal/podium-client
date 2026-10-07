// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RideDateField } from "./RideDateField";

describe("RideDateField", () => {
  it("picking 07 | Nov | 2026 and 07:00 gives 7 November, shown with the month by name", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RideDateField id="startsAt" value="" inputClassName="" onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
    expect(onChange).toHaveBeenLastCalledWith("", "2026-11-07"); // no time yet
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "07:00" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-11-07T07:00", "2026-11-07");

    rerender(
      <RideDateField
        id="startsAt"
        value="2026-11-07T07:00"
        inputClassName=""
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/Saturday, 07-Nov-2026 at 07:00/)).toBeTruthy();
    expect(screen.getByRole("option", { name: "Nov" })).toBeTruthy();
  });

  it("adopts a value set from outside (quick chip, edit prefill)", () => {
    render(<RideDateField id="s" value="2027-07-11T08:00" inputClassName="" onChange={() => {}} />);
    expect((screen.getByLabelText("Month") as HTMLSelectElement).value).toBe("7");
    expect((screen.getByLabelText("Time") as HTMLInputElement).value).toBe("08:00");
  });
});
