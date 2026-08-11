import Select, {
  type ClassNamesConfig,
  type GroupBase,
  type Props as ReactSelectProps,
  type SingleValue,
} from "react-select";

export type AppSelectOption = {
  value: string;
  label: string;
  isDisabled?: boolean;
};

type AppSelectProps = {
  id?: string;
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Prefer for unlabeled selects (e.g. compact rows). */
  "aria-label"?: string;
  className?: string;
  isClearable?: boolean;
  isSearchable?: boolean;
  /** Stretch to field width (default) vs hug content in toolbars. */
  fullWidth?: boolean;
};

const classNames: ClassNamesConfig<AppSelectOption, false, GroupBase<AppSelectOption>> = {
  container: () => "app-select__container",
  control: (state) =>
    [
      "app-select__control",
      state.isFocused ? "app-select__control--focused" : "",
      state.isDisabled ? "app-select__control--disabled" : "",
    ]
      .filter(Boolean)
      .join(" "),
  valueContainer: () => "app-select__value",
  placeholder: () => "app-select__placeholder",
  singleValue: () => "app-select__single",
  input: () => "app-select__input",
  indicatorsContainer: () => "app-select__indicators",
  dropdownIndicator: (state) =>
    `app-select__dropdown${state.selectProps.menuIsOpen ? " app-select__dropdown--open" : ""}`,
  clearIndicator: () => "app-select__clear",
  indicatorSeparator: () => "app-select__separator",
  menu: () => "app-select__menu",
  menuList: () => "app-select__menu-list",
  option: (state) =>
    [
      "app-select__option",
      state.isFocused ? "app-select__option--focused" : "",
      state.isSelected ? "app-select__option--selected" : "",
      state.isDisabled ? "app-select__option--disabled" : "",
    ]
      .filter(Boolean)
      .join(" "),
  noOptionsMessage: () => "app-select__empty",
};

/**
 * Themed single-select built on react-select.
 * Prefer this over native `<select>` so the chevron/menu match PRM chrome.
 */
export function AppSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  "aria-label": ariaLabel,
  className = "",
  isClearable = false,
  isSearchable = true,
  fullWidth = true,
}: AppSelectProps) {
  const selected = options.find((o) => o.value === value) ?? null;

  const handleChange = (next: SingleValue<AppSelectOption>) => {
    onChange(next?.value ?? "");
  };

  const selectProps: ReactSelectProps<AppSelectOption, false> = {
    inputId: id,
    instanceId: id,
    options,
    value: selected,
    onChange: handleChange,
    placeholder,
    isDisabled: disabled,
    isClearable,
    isSearchable,
    classNames,
    unstyled: true,
    "aria-label": ariaLabel,
    className: ["app-select", fullWidth ? "app-select--full" : "app-select--auto", className]
      .filter(Boolean)
      .join(" "),
    menuPortalTarget: typeof document !== "undefined" ? document.body : null,
    menuPosition: "fixed",
  };

  return <Select {...selectProps} />;
}
