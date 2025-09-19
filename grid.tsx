import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect
} from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

import TextField from "@mui/material/TextField";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";

type RowData = {
  ticker: string;
  name: string;
  sector: string;
};

type Suggestion = {
  column: string; // "ticker", "name", "sector", or "global"
  value: string;
};

const rowData: RowData[] = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Tech" },
  { ticker: "GOOG", name: "Alphabet Inc.", sector: "Tech" },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Auto" },
  { ticker: "JPM", name: "JP Morgan", sector: "Finance" },
  { ticker: "F", name: "Ford", sector: "Auto" }
];

export default function ElasticSearchGrid() {
  const gridRef = useRef<AgGridReact<RowData>>(null);

  const [inputValue, setInputValue] = useState("");
  const [selected, setSelected] = useState<Suggestion[]>([]);
  const [availableRows, setAvailableRows] = useState<RowData[]>(rowData);

  // Update availableRows whenever the grid filters
  useEffect(() => {
    if (!gridRef.current?.api) return;

    const listener = () => {
      const rows: RowData[] = [];
      gridRef.current!.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.data) rows.push(node.data);
      });
      setAvailableRows(rows);
    };

    gridRef.current.api.addEventListener("filterChanged", listener);
    listener(); // initialize
    return () => {
      gridRef.current?.api.removeEventListener("filterChanged", listener);
    };
  }, []);

  // Build column -> unique values from available rows only
  const columnValueMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    availableRows.forEach((row) => {
      Object.entries(row).forEach(([col, val]) => {
        if (!map[col]) map[col] = new Set();
        map[col].add(String(val));
      });
    });
    return map;
  }, [availableRows]);

  // Compute structured suggestions when typing
  const suggestions = useMemo(() => {
    if (!inputValue) return [];
    const results: Suggestion[] = [];

    Object.entries(columnValueMap).forEach(([col, values]) => {
      values.forEach((val) => {
        if (val.toLowerCase().includes(inputValue.toLowerCase())) {
          results.push({ column: col, value: val });
        }
      });
    });

    return results;
  }, [inputValue, columnValueMap]);

  // Apply filters (structured + global chips)
  const applyFilters = useCallback((filters: Suggestion[]) => {
    if (!gridRef.current?.api) return;

    const filterModel: Record<string, any> = {};
    const globalTerms: string[] = [];

    filters.forEach((s) => {
      if (s.column === "global") {
        globalTerms.push(s.value.toLowerCase());
      } else {
        if (!filterModel[s.column]) {
          filterModel[s.column] = { filterType: "set", values: [] };
        }
        filterModel[s.column].values.push(s.value);
      }
    });

    gridRef.current.api.setFilterModel(filterModel);

    // Custom global filter
    gridRef.current.api.setGridOption(
      "isExternalFilterPresent",
      () => globalTerms.length > 0
    );
    gridRef.current.api.setGridOption("doesExternalFilterPass", (node: any) => {
      if (!globalTerms.length) return true;
      return globalTerms.every((term) =>
        Object.values(node.data).some((val) =>
          String(val).toLowerCase().includes(term)
        )
      );
    });

    gridRef.current.api.onFilterChanged();
  }, []);

  // Handle selection changes
  const handleSelect = useCallback(
    (event: any, newValue: Suggestion[]) => {
      setSelected(newValue);
      applyFilters(newValue);
    },
    [applyFilters]
  );

  // When typing
  const handleInputChange = useCallback((_: any, newInput: string) => {
    setInputValue(newInput);
  }, []);

  // On blur, commit free text as global chip
  const handleBlur = useCallback(() => {
    if (inputValue && !suggestions.length) {
      const newGlobal = { column: "global", value: inputValue };
      const updated = [...selected, newGlobal];
      setSelected(updated);
      setInputValue("");
      applyFilters(updated);
    }
  }, [inputValue, suggestions, selected, applyFilters]);

  const columnDefs = [
    { field: "ticker", filter: "agSetColumnFilter" },
    { field: "name", filter: "agSetColumnFilter" },
    { field: "sector", filter: "agSetColumnFilter" }
  ];

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Autocomplete
        multiple
        value={selected}
        onChange={handleSelect}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onBlur={handleBlur}
        options={suggestions}
        groupBy={(option) =>
          option.column === "global" ? "Global" : option.column
        }
        getOptionLabel={(option) => option.value}
        filterOptions={createFilterOptions({ stringify: (option) => option.value })}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={option.column + option.value}
              label={
                option.column === "global"
                  ? `Global: ${option.value}`
                  : `${option.column}: ${option.value}`
              }
              color={option.column === "global" ? "secondary" : "primary"}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Search data..."
            variant="outlined"
            onKeyDown={(e) => {
              // Commit free-text as global chip
              if (e.key === "Enter" && inputValue && !suggestions.length) {
                e.preventDefault();
                const newGlobal = { column: "global", value: inputValue };
                const updated = [...selected, newGlobal];
                setSelected(updated);
                setInputValue("");
                applyFilters(updated);
              }

              // Remove last chip with Backspace if input is empty
              if (e.key === "Backspace" && !inputValue && selected.length > 0) {
                const updated = [...selected];
                updated.pop();
                setSelected(updated);
                applyFilters(updated);
              }
            }}
          />
        )}
        style={{ marginBottom: 12, width: 500 }}
      />

      <div className="ag-theme-alpine" style={{ height: 400, width: "100%" }}>
        <AgGridReact<RowData>
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={{ flex: 1, filter: true }}
        />
      </div>
    </div>
  );
}
