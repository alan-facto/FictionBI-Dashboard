const apiUrl = "https://script.google.com/macros/s/AKfycbyHUho9j0-swZTJO4Fka_59Nv3GVFqo-Qfbp3yydchcKZaUUcs7HxlWZ5mUO6vjH4mPTA/exec";

// Structure to hold processed data
// Added 'earnings' property to each month's data to store revenue
let data = { months: [], departments: [], data: {} };
let sortedMonths = [];

// Holds chart instances globally
let charts = {};

// Map sheet department names to dashboard names
const deptMap = {
    "Administrativo Financeiro": "Administrativo",
    "Apoio": "Apoio",
    "Comercial": "Comercial",
    "Diretoria": "Diretoria",
    "Jurídico Externo": "Jurídico",
    "Marketing": "Marketing",
    "NEC": "NEC",
    "Operação Geral": "Operação",
    "RH / Departamento Pessoal": "RH"
};

// Helper function to convert month abbreviations (e.g., "set.-24" to "2024-09")
function convertMonthToYYYYMM(monthShortStr) {
    const [monthAbbr, yearShort] = monthShortStr.split('-');
    const yearFull = parseInt(yearShort, 10) < 50 ? `20${yearShort}` : `19${yearShort}`; // Assumes 2000s
    const monthMap = {
        "jan.": "01", "fev.": "02", "mar.": "03", "abr.": "04", "mai.": "05", "jun.": "06",
        "jul.": "07", "ago.": "08", "set.": "09", "out.": "10", "nov.": "11", "dez.": "12"
    };
    const monthNum = monthMap[monthAbbr.toLowerCase()];
    return `${yearFull}-${monthNum}`;
}

// Hardcoded earnings data from FactoBI_Data.xlsx - Sheet2.csv
const earningsCsvContent = `Mês,Faturamento
set.-24,"R$ 623.628,74"
out.-24,"R$ 490.251,93"
nov.-24,"R$ 444.936,70"
dez.-24,"R$ 242.416,72"
jan.-25,"R$ 708.662,16"
fev.-25,"R$ 482.203,04"
mar.-25,"R$ 571.218,45"
abr.-25,"R$ 529.025,05"
mai.-25,"R$ 133.723,72"
jun.-25,"R$ 567.155,13"
jul.-25,"R$ 513.826,17"`;

// Ensure dashboard initialization happens AFTER the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
    // Parse earnings data *inside* DOMContentLoaded to ensure it's available
    // within this scope when needed, even if global scope has issues.
    const earningsRows = earningsCsvContent.split('\n').slice(1).map(row => {
        const [monthStr, faturamentoStr] = row.split(',');
        return {
            month: monthStr.trim(),
            faturamento: parseFloat(faturamentoStr.replace(/["R$\s.]/g, '').replace(',', '.')) || 0
        };
    });

    // Fetch and process live data (Sheet1)
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(fetchedRows => {
            if (!fetchedRows || !Array.isArray(fetchedRows)) {
                throw new Error('Invalid data format received from API');
            }

            const monthsSet = new Set();
            const departmentsSet = new Set();
            const structuredData = {};

            // Initialize structure for all months that will be present in the data (from both sources)
            const allPossibleMonths = new Set([
                ...fetchedRows.map(row => row["Month"]),
                ...earningsRows.map(row => convertMonthToYYYYMM(row.month))
            ]);
            Array.from(allPossibleMonths).sort().forEach(month => {
                structuredData[month] = {
                    departments: {},
                    total: 0,
                    totalEmployees: 0,
                    earnings: 0
                };
            });


            // Process Sheet1 data first
            fetchedRows.forEach(row => {
                try {
                    const month = row["Month"];
                    const rawDept = row["Department"];
                    const dept = deptMap[rawDept] || rawDept; // Map department names
                    const total = parseFloat(row["Total"]) || 0;
                    const bonificacao = parseFloat(row["Bonificacao 20"]) || 0;
                    const count = parseInt(row["Employee Count"]) || 0;
                    const geral = parseFloat(row["Total Geral"]) || (total + bonificacao); // Total costs + bonuses

                    monthsSet.add(month);

                    if (dept.toLowerCase() !== "total geral") { // Exclude overall total if present
                        departmentsSet.add(dept);

                        // Ensure department exists for the month
                        if (!structuredData[month].departments[dept]) {
                            structuredData[month].departments[dept] = {
                                total: 0, bonificacao: 0, count: 0, geral: 0
                            };
                        }
                        structuredData[month].departments[dept] = {
                            total, bonificacao, count, geral
                        };
                        structuredData[month].total += geral; // Aggregate total costs for the month
                        structuredData[month].totalEmployees += count; // Aggregate total employees for the month
                    }
                } catch (error) {
                    console.error('Error processing row from Sheet1:', row, error);
                }
            });

            // Merge earnings data into structuredData
            earningsRows.forEach(row => {
                const monthKey = convertMonthToYYYYMM(row.month);
                if (structuredData[monthKey]) { // Only add if the month exists from sheet1 or was pre-initialized
                    structuredData[monthKey].earnings = row.faturamento;
                }
                monthsSet.add(monthKey); // Ensure all months from earnings are included
            });

            // Final data assignment
            data = {
                months: Array.from(monthsSet).sort(),
                departments: Array.from(departmentsSet).sort(), // Ensure departments are sorted for consistency
                data: structuredData
            };

            sortedMonths = data.months.slice(); // Keep a sorted list of all months
            initDashboard(); // Initialize the dashboard once all data is processed
        })
        .catch(error => {
            console.error("Error loading data:", error);
            showError('Falha ao carregar os dados. Por favor, recarregue a página.');
        });
});


const translations = {
    "Total Expenditures": "Gastos Totais",
    "Company Average per Employee": "Média da Empresa por Funcionário",
    "Employees": "Funcionários",
    "Amount": "Valor",
    "Percentage": "Percentual",
    "Expenditure": "Gastos",
    "Total": "Total",
    "Earnings": "Faturamento",
    "Net Profit/Loss": "Lucro/Prejuízo Líquido",
    "Profit Margin": "Margem de Lucro",
    "Earnings Per Employee": "Faturamento por Funcionário",
    "Contribution to Earnings": "Contribuição para Faturamento"
};

const colorsByDepartment = {
    "Administrativo": "#6B5B95",  // Royal purple (unique, authoritative)
    "Apoio": "#FF6F61",          // Coral (friendly, energetic)
    "Comercial": "#E44D42",      // Bright red (urgent, salesy)
    "Diretoria": "#0072B5",      // Vivid blue (leadership, trust)
    "Jurídico": "#2E8B57",       // Forest green (stable, legal)
    "Marketing": "#FFA500",      // Orange (creative, bold - but not neon)
    "NEC": "#9370DB",            // Medium purple (distinctive)
    "Operação": "#00A86B",       // Jade green (fresh, operational)
    "RH": "#FF69B4"              // Hot pink (friendly, human touch)
};

// Helper to convert hex color to RGBA for chart backgrounds
function hexToRGBA(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Safely parse JSON strings for department filters
function tryParseJSON(jsonString) {
    if (jsonString === undefined || jsonString === null ||
        jsonString === 'undefined' || jsonString === 'null' || jsonString.trim() === '') {
        return [];
    }
    if (jsonString === 'all') {
        return data.departments || [];
    }
    try {
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('Failed to parse JSON, using empty array as fallback:', jsonString);
        return [];
    }
}

// Normalize department name to its short key
function normalizeDepartmentName(name) {
    if (!name) return "";
    const key = name.toLowerCase().trim();
    for (const [longName, shortName] of Object.entries(deptMap)) {
        if (longName.toLowerCase() === key || shortName.toLowerCase() === key) {
            return shortName;
        }
    }
    return name; // fallback if no match
}

// Format month labels for display (e.g., "09/2024" to "Setembro/2024")
function formatMonthLabel(monthStr) {
    const [year, month] = monthStr.split("-");
    const monthsPt = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    return `${monthsPt[parseInt(month) - 1]}/${year}`;
}

// Format month labels for short display (e.g., "2024-09" to "09/24")
function formatMonthShort(monthStr) {
    const [year, month] = monthStr.split("-");
    return `${month}/${year.slice(2)}`;
}

// Format currency to BRL
function formatCurrencyBRL(value) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

// Generate legend for department breakdown charts
function generateDepartmentLegend(departments, colorMap) {
    const legendContainer = document.getElementById("department-legend");
    if (!legendContainer) return;
    legendContainer.innerHTML = "";

    departments.forEach(dept => {
        const item = document.createElement("div");
        item.className = "department-legend-item";

        const swatch = document.createElement("span");
        swatch.className = "department-legend-swatch";
        swatch.style.backgroundColor = colorMap[dept] || "#ccc";

        const label = document.createElement("span");
        label.textContent = dept;

        item.appendChild(swatch);
        item.appendChild(label);
        legendContainer.appendChild(item);
    });
}

// Setup logic for table view toggle buttons
function setupTableToggle() {
    const buttons = {
        'btn-summary-month': 'table-summary-month',
        'btn-summary-department': 'table-summary-department',
        'btn-detailed-month': 'table-detailed-month',
        'btn-detailed-department': 'table-detailed-department',
        'btn-earnings-table': 'table-earnings' // New earnings table button
    };

    Object.entries(buttons).forEach(([btnId, tableId]) => {
        const button = document.getElementById(btnId);
        if (button) {
            button.addEventListener('click', () => {
                // Hide all tables and deactivate all buttons
                Object.values(buttons).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                Object.keys(buttons).forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.classList.remove('active');
                });

                // Show selected table and activate button
                const tableEl = document.getElementById(tableId);
                if (tableEl) {
                    tableEl.style.display = 'block';
                    button.classList.add('active');

                    // Clear and regenerate content every time to ensure fresh data
                    tableEl.innerHTML = '';
                    if (btnId === 'btn-summary-month') generateSummaryByMonth();
                    if (btnId === 'btn-summary-department') generateSummaryByDepartment();
                    if (btnId === 'btn-detailed-month') generateDetailedByMonth();
                    if (btnId === 'btn-detailed-department') generateDetailedByDepartment();
                    if (btnId === 'btn-earnings-table') generateEarningsTable(); // Call new function
                }
            });
        }
    });
    // Ensure one table button is active on init if tables view is visible
    // This will be triggered only if the main "Tabelas" button is clicked
    // and its parent view is made visible.
}


// Setup logic for main view toggle (Gastos vs. Faturamento vs. Tabelas)
function setupViewToggle() {
    const btnExpensesMain = document.getElementById('btn-expenses-main'); // Renamed
    const btnEarningsMain = document.getElementById('btn-earnings-main'); // New
    const btnTablesMain = document.getElementById('btn-tables-main');     // Renamed
    const chartsView = document.getElementById('charts-view');
    const tablesView = document.getElementById('tables-view');
    const earningsView = document.getElementById('earnings-view');

    if (!btnExpensesMain || !btnEarningsMain || !btnTablesMain || !chartsView || !tablesView || !earningsView) {
        console.warn('One or more main view toggle elements not found. Skipping setupViewToggle.');
        return;
    }

    // Function to set active view
    const setActiveView = (activeBtn, activeViewDiv) => {
        [btnExpensesMain, btnEarningsMain, btnTablesMain].forEach(btn => btn.classList.remove('active'));
        [chartsView, tablesView, earningsView].forEach(view => view.style.display = 'none');

        activeBtn.classList.add('active');
        activeViewDiv.style.display = 'flex'; // Use flex for chart/earnings views, block for tables

        // Trigger updates/generation based on the view
        if (activeViewDiv === tablesView) {
            // When switching to tables view, ensure the default summary table is generated
            const defaultTableButton = document.getElementById('btn-summary-month');
            if (defaultTableButton && !defaultTableButton.classList.contains('active')) {
                defaultTableButton.click(); // Simulate click to generate content
            } else if (defaultTableButton && defaultTableButton.classList.contains('active')) {
                 // If it's already active, just regenerate content
                 generateSummaryByMonth();
            }
        } else if (activeViewDiv === chartsView || activeViewDiv === earningsView) {
            // Redraw charts when switching back to chart-based views
            setTimeout(() => {
                Object.keys(charts).forEach(chartKey => {
                    const chartInstance = charts[chartKey];
                    // Check if chart's canvas is within the *currently active* view
                    const canvasId = chartKey.replace(/([A-Z])/g, '-$1').toLowerCase(); // e.g., 'totalExpenditures' -> 'total-expenditures'
                    const canvasElement = document.getElementById(`${canvasId}-chart`);
                    
                    // Specific check for departmentBreakdown which uses a div ID
                    const containerId = (chartKey === 'departmentBreakdown') ? 'department-breakdown-charts' : null;
                    const containerElement = document.getElementById(containerId);

                    const isChartVisible = (canvasElement && activeViewDiv.contains(canvasElement)) ||
                                           (containerElement && activeViewDiv.contains(containerElement));

                    if (chartInstance && typeof chartInstance.update === 'function' && isChartVisible) {
                        const currentMonthsRange = document.querySelector('.time-btn.active')?.dataset?.months || 'all';
                        const monthsToShow = getMonthsToShow(data.months, currentMonthsRange);
                        
                        // Handle specific chart update needs
                        if (chartKey === 'totalExpenditures') {
                            const activeDept = document.querySelector('#total-expenditures-wrapper .filter-btn.active')?.dataset?.department || 'all';
                            chartInstance.update(data.data, monthsToShow, activeDept);
                        } else if (chartKey === 'departmentTrends') {
                            const activeDeptsFilter = document.querySelector('#department-trends-wrapper .filter-btn.active')?.dataset?.departments || 'all';
                            chartInstance.update(monthsToShow, tryParseJSON(activeDeptsFilter));
                        } else if (chartKey === 'earningsPerEmployee') {
                            const mode = document.getElementById('toggle-earnings-per-employee')?.textContent.includes('(Geral)') ? 'company' : 'operation';
                            chartInstance.update(monthsToShow, mode);
                        } else {
                            chartInstance.update(monthsToShow);
                        }
                    }
                });
            }, 100);
        }
    };

    btnExpensesMain.addEventListener('click', () => setActiveView(btnExpensesMain, chartsView));
    btnEarningsMain.addEventListener('click', () => setActiveView(btnEarningsMain, earningsView));
    btnTablesMain.addEventListener('click', () => setActiveView(btnTablesMain, tablesView));
    
    // Set initial active button (Gastos)
    btnExpensesMain.classList.add('active');
    chartsView.style.display = 'flex'; // Ensure initial view is 'flex'
}

// Functions to generate different table views
function generateSummaryByMonth() {
    const container = document.getElementById('table-summary-month');
    if (!container) return;
    container.innerHTML = '';

    data.months.forEach(month => {
        const monthData = data.data[month];
        const section = document.createElement('div');
        section.innerHTML = `<h3>${formatMonthLabel(month)}</h3>`;

        const table = document.createElement('table');
        table.className = 'summary';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Departamento</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(monthData.departments).map(([dept, d]) => `
                    <tr>
                        <td>${dept}</td>
                        <td>${formatCurrencyBRL(d.geral)}</td>
                    </tr>
                `).join('')}
                <tr style="font-weight: bold; background-color: #e0e0e0;">
                    <td>Total Geral Mensal</td>
                    <td>${formatCurrencyBRL(monthData.total)}</td>
                </tr>
                <tr style="font-weight: bold; background-color: #f0f0f0;">
                    <td>Faturamento Mensal</td>
                    <td>${formatCurrencyBRL(monthData.earnings)}</td>
                </tr>
            </tbody>
        `;
        section.appendChild(table);
        container.appendChild(section);
    });
}

function generateSummaryByDepartment() {
    const container = document.getElementById('table-summary-department');
    if (!container) return;
    container.innerHTML = '';

    data.departments.forEach(dept => {
        const section = document.createElement('div');
        section.innerHTML = `<h3>${dept}</h3>`;

        const table = document.createElement('table');
        table.className = 'summary';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Mês</th>
                    <th>Total Gasto</th>
                    <th>Funcionários</th>
                </tr>
            </thead>
            <tbody>
                ${data.months.map(month => {
            const d = data.data[month].departments[dept];
            return d ? `
                        <tr>
                            <td>${formatMonthLabel(month)}</td>
                            <td>${formatCurrencyBRL(d.geral)}</td>
                            <td>${d.count || 0}</td>
                        </tr>
                    ` : '';
        }).join('')}
            </tbody>
        `;
        section.appendChild(table);
        container.appendChild(section);
    });
}

function generateDetailedByMonth() {
    const container = document.getElementById('table-detailed-month');
    if (!container) return;
    container.innerHTML = '';

    data.months.forEach(month => {
        const section = document.createElement('div');
        section.innerHTML = `<h3>${formatMonthLabel(month)}</h3>`;

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        thead.innerHTML = `
            <tr>
                <th>Departamento</th>
                <th>Funcionários</th>
                <th>Total (Sem Bon.)</th>
                <th>Bonificação (Dia 20)</th>
                <th>Total Geral (Com Bon.)</th>
            </tr>
        `;

        data.departments.forEach(dept => {
            const d = data.data[month].departments[dept];
            if (d) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${dept}</td>
                    <td>${d.count || 0}</td>
                    <td>${formatCurrencyBRL(d.total)}</td>
                    <td>${formatCurrencyBRL(d.bonificacao)}</td>
                    <td>${formatCurrencyBRL(d.geral)}</td>
                `;
                tbody.appendChild(row);
            }
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        section.appendChild(table);
        container.appendChild(section);
    });
}

function generateDetailedByDepartment() {
    const container = document.getElementById('table-detailed-department');
    if (!container) return;
    container.innerHTML = '';

    data.departments.forEach(dept => {
        const section = document.createElement('div');
        section.innerHTML = `<h3>${dept}</h3>`;

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        thead.innerHTML = `
            <tr>
                <th>Mês</th>
                <th>Funcionários</th>
                <th>Total (Sem Bon.)</th>
                <th>Bonificação (Dia 20)</th>
                <th>Total Geral (Com Bon.)</th>
            </tr>
        `;

        data.months.forEach(month => {
            const d = data.data[month].departments[dept];
            if (d) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatMonthLabel(month)}</td>
                    <td>${d.count || 0}</td>
                    <td>${formatCurrencyBRL(d.total)}</td>
                    <td>${formatCurrencyBRL(d.bonificacao)}</td>
                    <td>${formatCurrencyBRL(d.geral)}</td>
                `;
                tbody.appendChild(row);
            }
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        section.appendChild(table);
        container.appendChild(section);
    });
}

// NEW FUNCTION: Generate Earnings Table
function generateEarningsTable() {
    const container = document.getElementById('table-earnings');
    if (!container) return;
    container.innerHTML = '';

    const section = document.createElement('div');
    section.innerHTML = `<h3>Faturamento Mensal</h3>`; // Table title

    const table = document.createElement('table');
    table.className = 'summary'; // Using summary class for styling
    table.innerHTML = `
        <thead>
            <tr>
                <th>Mês</th>
                <th>Faturamento</th>
                <th>Gastos Totais</th>
                <th>Lucro / Prejuízo Líquido</th>
                <th>Margem de Lucro (%)</th>
            </tr>
        </thead>
        <tbody>
            ${data.months.map(month => {
                const monthData = data.data[month];
                const earnings = monthData.earnings || 0;
                const totalCosts = monthData.total || 0;
                const netProfit = earnings - totalCosts;
                const profitMargin = (earnings > 0) ? (netProfit / earnings) * 100 : 0;

                return `
                    <tr>
                        <td>${formatMonthLabel(month)}</td>
                        <td>${formatCurrencyBRL(earnings)}</td>
                        <td>${formatCurrencyBRL(totalCosts)}</td>
                        <td style="color: ${netProfit >= 0 ? '#00A86B' : '#E44D42'}; font-weight: bold;">${formatCurrencyBRL(netProfit)}</td>
                        <td style="color: ${profitMargin >= 0 ? '#00A86B' : '#E44D42'}; font-weight: bold;">${profitMargin.toFixed(2)}%</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    `;
    section.appendChild(table);
    container.appendChild(section);
}


// Helper to get months based on selected range (3, 6, 12, or all)
function getMonthsToShow(allMonths, range) {
    if (range === 'all') return allMonths;
    return allMonths.slice(-parseInt(range));
}

// Chart.js tooltip callback for consistent formatting and translation
function translateTooltip(context) {
    const label = context.dataset.label || '';
    const translatedLabel = translations[label] || label;
    const value = context.raw;

    if (label.includes('Gastos') || label.includes('Faturamento') || label.includes('Lucro/Prejuízo')) {
        return `${translatedLabel}: ${formatCurrencyBRL(value)}`;
    }
    if (label.includes('Funcionário')) {
        return `${translatedLabel}: ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (label.includes('Margem')) {
        return `${translatedLabel}: ${value.toFixed(2)}%`;
    }
    return `${translatedLabel}: ${value}`;
}

// Setup time filter buttons for existing charts
function setupTimeFilters() {
    // Total Expenditures - Time Filters
    document.querySelectorAll('#total-expenditures-wrapper .time-btn').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('#total-expenditures-wrapper .time-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const activeDepartment = document.querySelector('#total-expenditures-wrapper .filter-buttons .filter-btn.active').dataset.department; // Get current active department filter
            const monthsToShow = getMonthsToShow(data.months, button.dataset.months);
            charts.totalExpenditures.update(data.data, monthsToShow, activeDepartment);
        });
    });

    // Total Expenditures - Department Filters
    document.querySelectorAll('#total-expenditures-wrapper .filter-buttons .filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('#total-expenditures-wrapper .filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const selectedDepartment = button.dataset.department;
            const activeMonths = document.querySelector('#total-expenditures-wrapper .time-btn.active').dataset.months; // Get current active time filter
            const monthsToShow = getMonthsToShow(data.months, activeMonths);
            charts.totalExpenditures.update(data.data, monthsToShow, selectedDepartment);
        });
    });

    // Department Trends - Time Filters and Department Filters (combined logic)
    const trendsWrapper = document.getElementById('department-trends-wrapper');
    if (trendsWrapper) {
        const updateDepartmentTrendsChart = () => {
            if (!charts.departmentTrends?.update) {
                console.warn('Department trends chart not available for update');
                return;
            }
            const activeTimeBtn = trendsWrapper.querySelector('.time-btn.active');
            const monthsRange = activeTimeBtn?.dataset?.months || 'all';
            const monthsToShow = getMonthsToShow(data.months, monthsRange);

            const activeDeptBtn = trendsWrapper.querySelector('.filter-buttons .filter-btn.active'); // Ensure correct selector
            const selectedDepartments = tryParseJSON(activeDeptBtn?.dataset?.departments || 'all');

            charts.departmentTrends.update(monthsToShow, selectedDepartments);
        };

        trendsWrapper.querySelectorAll('.time-btn').forEach(button => {
            button.addEventListener('click', function() {
                trendsWrapper.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                updateDepartmentTrendsChart();
            });
        });

        trendsWrapper.querySelectorAll('.filter-buttons .filter-btn').forEach(button => { // Ensure correct selector
            button.addEventListener('click', function() {
                trendsWrapper.querySelectorAll('.filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                updateDepartmentTrendsChart();
            });
        });

        // Initial state for department trends is now handled by initDashboard directly
    }
}


// --- CHART CREATION FUNCTIONS ---

// Existing Chart: Total Expenditures Chart (Company-wide or specific department)
function createTotalExpendituresChart(data, months, departments) {
    const canvas = document.getElementById('total-expenditures-chart');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months.map(formatMonthShort),
            datasets: [{
                label: 'Gastos Totais',
                data: months.map(month => data[month]?.total || 0),
                borderColor: '#024B59',
                backgroundColor: hexToRGBA('#024B59', 0.1),
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) { return formatCurrencyBRL(value); }
                    }
                }
            }
        }
    });

    return {
        update: function(newData, monthsToShow, selectedDepartment = 'all') {
            const monthsArr = monthsToShow.slice();
            chart.data.labels = monthsArr.map(formatMonthShort);

            if (selectedDepartment === 'all') {
                const totals = monthsArr.map(month => newData[month]?.total || 0);
                chart.data.datasets = [{
                    label: 'Gastos Totais',
                    data: totals,
                    borderColor: '#024B59',
                    backgroundColor: hexToRGBA('#024B59', 0.1),
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }];
            } else {
                const selectedShort = normalizeDepartmentName(selectedDepartment);
                const series = monthsArr.map(m => newData[m]?.departments?.[selectedShort]?.geral || 0);
                const color = colorsByDepartment[selectedShort] || '#cccccc';

                chart.data.datasets = [{
                    label: `Gastos - ${selectedShort}`,
                    data: series,
                    borderColor: color,
                    backgroundColor: hexToRGBA(color, 0.12),
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }];
            }
            chart.update();
        }
    };
}

// Existing Chart: Department Trends (multiple departments over time)
function createDepartmentTrendsChart(data, months, departments) {
    const ctx = document.getElementById('department-trends-chart');
    if (!ctx) return null;

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: months.map(formatMonthShort),
            datasets: departments.map(dept => ({
                label: dept,
                data: months.map(month => data[month]?.departments[dept]?.geral || 0),
                borderColor: colorsByDepartment[dept] || "#ccc",
                backgroundColor: 'transparent',
                borderWidth: 2,
                fill: false,
                tension: 0.3
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { position: 'top', labels: { boxWidth: 12 } }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) { return formatCurrencyBRL(value); }
                    }
                }
            }
        }
    });

    return {
        update: function(monthsToShow = months, filteredDepartments = departments) {
            if (!chart) return;
            const filteredMonths = monthsToShow.filter(month => data[month]);
            const datasets = filteredDepartments.map(dept => ({
                label: dept,
                data: filteredMonths.map(month => data[month]?.departments[dept]?.geral || 0),
                borderColor: colorsByDepartment[dept] || "#ccc",
                backgroundColor: 'transparent',
                borderWidth: 2,
                fill: false,
                tension: 0.3
            }));
            chart.data.labels = filteredMonths.map(formatMonthShort);
            chart.data.datasets = datasets;
            chart.update();
        }
    };
}

// Existing Chart: Average Expenditure Per Employee
function createAvgExpenditureChart(data, months) {
    const ctx = document.getElementById('avg-expenditure-chart');
    if (!ctx) return null;

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: months.map(formatMonthShort),
            datasets: [{
                label: 'Média de Gastos por Funcionário',
                data: months.map(month => {
                    const monthData = data[month];
                    return (monthData?.totalEmployees > 0) ? monthData.total / monthData.totalEmployees : 0;
                }),
                borderColor: '#024B59',
                backgroundColor: hexToRGBA('#024B59', 0.1),
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) { return formatCurrencyBRL(value); }
                    }
                }
            }
        }
    });

    return {
        update: function(newMonths) {
            if (!chart) return;
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets[0].data = newMonths.map(month => {
                const m = data[month];
                return (m?.totalEmployees > 0) ? m.total / m.totalEmployees : 0;
            });
            chart.update();
        }
    };
}

// Existing Chart: Total Employees
function createEmployeesChart(data, months) {
    const ctx = document.getElementById('employees-chart');
    if (!ctx) return null;

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: months.map(formatMonthShort),
            datasets: [{
                label: 'Total de Funcionários',
                data: months.map(month => data[month]?.totalEmployees || 0),
                borderColor: '#024B59',
                backgroundColor: hexToRGBA('#024B59', 0.1),
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });

    return {
        update: function(newMonths) {
            if (!chart) return;
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets[0].data = newMonths.map(month => data[month]?.totalEmployees || 0);
            chart.update();
        }
    };
}

// Existing Chart: Percentage Stacked (Departmental costs as % of total costs)
function createPercentageStackedChart(data, months, departments) {
    const ctx = document.getElementById('percentage-stacked-chart');
    if (!ctx) return null;

    const datasets = departments.map(dept => ({
        label: dept,
        data: months.map(month => {
            const deptTotal = data[month]?.departments[dept]?.geral || 0;
            const total = data[month]?.total || 1;
            return (total > 0) ? (deptTotal / total) * 100 : 0;
        }),
        backgroundColor: colorsByDepartment[dept] || "#ccc",
        borderColor: colorsByDepartment[dept] || "#ccc",
        stack: 'stack1'
    }));

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: { labels: months.map(formatMonthShort), datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { position: 'right', labels: { boxWidth: 12 } }
            },
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: function(value) { return value + "%"; } }
                }
            }
        }
    });

    return {
        update: function(newMonths) {
            if (!chart) return;
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets.forEach((dataset, idx) => {
                const dept = departments[idx];
                dataset.data = newMonths.map(month => {
                    const deptTotal = data[month]?.departments[dept]?.geral || 0;
                    const total = data[month]?.total || 1;
                    return (total > 0) ? (deptTotal / total) * 100 : 0;
                });
            });
            chart.update();
        }
    };
}

// Existing Chart: Department Breakdown (Pie Charts for last 6 months)
function createDepartmentBreakdownCharts(data, months, departments) {
    const container = document.getElementById('department-breakdown-charts');
    const legendContainer = document.getElementById('department-legend');
    if (!container || !legendContainer) return null;

    // Destroy any existing Chart.js instances within this container
    Array.from(container.querySelectorAll('canvas')).forEach(c => {
        const chart = Chart.getChart(c);
        if (chart) chart.destroy();
    });

    container.innerHTML = '';
    legendContainer.innerHTML = '';

    const breakdownCharts = {};
    const recentMonths = months.slice(-6); // last 6 months
    const disabledDepartments = new Set();

    const getActiveDepartments = () => departments.filter(d => !disabledDepartments.has(d));

    // Create one pie chart per month
    recentMonths.forEach(month => {
        const pieItem = document.createElement('div');
        pieItem.className = 'pie-item';

        const canvas = document.createElement('canvas');
        pieItem.appendChild(canvas);

        const label = document.createElement('div');
        label.className = 'pie-label';
        label.textContent = formatMonthLabel(month);
        pieItem.appendChild(label);

        container.appendChild(pieItem);

        const activeDepts = getActiveDepartments();

        breakdownCharts[month] = new Chart(canvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels: activeDepts,
                datasets: [{
                    data: activeDepts.map(dept => data[month].departments[dept]?.geral || 0),
                    backgroundColor: activeDepts.map(dept => colorsByDepartment[dept] || "#ccc"),
                    borderColor: '#fff',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                let value = context.raw;
                                return `${context.label}: ${formatCurrencyBRL(value)}`;
                            }
                        }
                    }
                }
            }
        });
    });

    // Shared legend logic
    departments.forEach(dept => {
        const legendItem = document.createElement('div');
        legendItem.className = 'department-legend-item';
        legendItem.dataset.department = dept;

        const swatch = document.createElement('span');
        swatch.className = "department-legend-swatch";
        swatch.style.backgroundColor = colorsByDepartment[dept] || '#ccc';

        const label = document.createElement('span');
        label.textContent = dept;

        legendItem.appendChild(swatch);
        legendItem.appendChild(label);

        // Toggle visibility on click
        legendItem.addEventListener('click', () => {
            if (disabledDepartments.has(dept)) {
                disabledDepartments.delete(dept);
                legendItem.classList.remove('inactive');
            } else {
                disabledDepartments.add(dept);
                legendItem.classList.add('inactive');
            }

            const activeDepts = getActiveDepartments();

            // Update all pies
            recentMonths.forEach(month => {
                const chart = breakdownCharts[month];
                if (chart) {
                    chart.data.labels = activeDepts;
                    chart.data.datasets[0].data = activeDepts.map(d => data[month].departments[d]?.geral || 0);
                    chart.data.datasets[0].backgroundColor = activeDepts.map(d => colorsByDepartment[d] || '#ccc');
                    chart.update();
                }
            });
        });

        legendContainer.appendChild(legendItem);
    });

    return { update: () => {} }; // This chart updates internally via legend clicks
}


// --- NEW CHART CREATION FUNCTIONS ---

// New Chart 1: Earnings vs Total Costs
function createEarningsVsCostsChart(data, months) {
    const ctx = document.getElementById('earnings-vs-costs-chart');
    if (!ctx) return null;

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: months.map(formatMonthShort),
            datasets: [
                {
                    label: translations['Earnings'],
                    data: months.map(month => data[month]?.earnings || 0),
                    borderColor: '#00A86B', // Green for earnings
                    backgroundColor: hexToRGBA('#00A86B', 0.1),
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: translations['Total Expenditures'],
                    data: months.map(month => data[month]?.total || 0),
                    borderColor: '#E44D42', // Red for costs
                    backgroundColor: hexToRGBA('#E44D42', 0.1),
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: false,
                    ticks: { callback: function(value) { return formatCurrencyBRL(value); } }
                }
            }
        }
    });

    return {
        update: function(newMonths) {
            if (!chart) return;
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets[0].data = newMonths.map(month => data[month]?.earnings || 0);
            chart.data.datasets[1].data = newMonths.map(month => data[month]?.total || 0);
            chart.update();
        }
    };
}

// New Chart 2: Net Profit/Loss
function createNetProfitLossChart(data, months) {
    const ctx = document.getElementById('net-profit-loss-chart');
    if (!ctx) return null;

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: months.map(formatMonthShort),
            datasets: [{
                label: translations['Net Profit/Loss'],
                data: months.map(month => (data[month]?.earnings || 0) - (data[month]?.total || 0)),
                backgroundColor: months.map(month => {
                    const profit = (data[month]?.earnings || 0) - (data[month]?.total || 0);
                    return profit >= 0 ? '#00A86B' : '#E44D42'; // Green for profit, red for loss
                }),
                borderColor: '#fff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return formatCurrencyBRL(value); } }
                }
            }
        }
    });

    return {
        update: function(newMonths) {
            if (!chart) return;
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets[0].data = newMonths.map(month => (data[month]?.earnings || 0) - (data[month]?.total || 0));
            chart.data.datasets[0].backgroundColor = newMonths.map(month => {
                const profit = (data[month]?.earnings || 0) - (data[month]?.total || 0);
                return profit >= 0 ? '#00A86B' : '#E44D42';
            });
            chart.update();
        }
    };
}

// New Chart 3: Profit Margin Percentage
function createProfitMarginChart(data, months) {
    const ctx = document.getElementById('profit-margin-chart');
    if (!ctx) return null;

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: months.map(formatMonthShort),
            datasets: [{
                label: translations['Profit Margin'],
                data: months.map(month => {
                    const earnings = data[month]?.earnings || 0;
                    const totalCosts = data[month]?.total || 0;
                    return (earnings > 0) ? ((earnings - totalCosts) / earnings) * 100 : 0;
                }),
                borderColor: '#0072B5', // Blue for margin
                backgroundColor: hexToRGBA('#0072B5', 0.1),
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return value.toFixed(0) + "%"; } }
                }
            }
        }
    });

    return {
        update: function(newMonths) {
            if (!chart) return;
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets[0].data = newMonths.map(month => {
                const earnings = data[month]?.earnings || 0;
                const totalCosts = data[month]?.total || 0;
                return (earnings > 0) ? ((earnings - totalCosts) / earnings) * 100 : 0;
            });
            chart.update();
        }
    };
}

// New Chart 4: Earnings per Employee (with toggle)
function createEarningsPerEmployeeChart(data, months) {
    const ctx = document.getElementById('earnings-per-employee-chart');
    if (!ctx) return null;

    let currentMode = 'company'; // 'company' or 'operation'

    const getChartData = (mode, currentMonths) => {
        if (mode === 'company') {
            return currentMonths.map(month => {
                const earnings = data[month]?.earnings || 0;
                const totalEmployees = data[month]?.totalEmployees || 0;
                return (totalEmployees > 0) ? earnings / totalEmployees : 0;
            });
        } else if (mode === 'operation') {
            return currentMonths.map(month => {
                const earnings = data[month]?.earnings || 0;
                const operationEmployees = data[month]?.departments?.Operação?.count || 0;
                return (operationEmployees > 0) ? earnings / operationEmployees : 0;
            });
        }
        return [];
    };

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: months.map(formatMonthShort),
            datasets: [{
                label: 'Faturamento por Funcionário (Geral)',
                data: getChartData(currentMode, months),
                borderColor: '#F28E2B', // Orange
                backgroundColor: hexToRGBA('#F28E2B', 0.1),
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: translateTooltip } },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: { callback: function(value) { return formatCurrencyBRL(value); } }
                }
            }
        }
    });

    // Setup toggle button listener
    const toggleButton = document.getElementById('toggle-earnings-per-employee');
    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            currentMode = (currentMode === 'company') ? 'operation' : 'company';
            toggleButton.textContent = (currentMode === 'company') ?
                'Ver Faturamento por Funcionário (Operação)' : 'Ver Faturamento por Funcionário (Geral)';
            chart.data.datasets[0].data = getChartData(currentMode, chart.data.labels.map(label => { // Reconvert label to full month key
                const [monthNum, yearShort] = label.split('/');
                const yearFull = `20${yearShort}`;
                const monthMapRev = {
                    "01": "jan.", "02": "fev.", "03": "mar.", "04": "abr.", "05": "mai.", "06": "jun.",
                    "07": "jul.", "08": "ago.", "09": "set.", "10": "out.", "11": "nov.", "12": "dez."
                };
                return `${yearFull}-${monthNum}`;
            }).sort());
            chart.data.datasets[0].label = (currentMode === 'company') ?
                'Faturamento por Funcionário (Geral)' : 'Faturamento por Funcionário (Operação)';
            chart.update();
        });
    }

    return {
        update: function(newMonths, mode = currentMode) { // Also allow external update to change mode
            if (!chart) return;
            currentMode = mode;
            if (toggleButton) { // Update button text on external update too
                 toggleButton.textContent = (currentMode === 'company') ?
                    'Ver Faturamento por Funcionário (Operação)' : 'Ver Faturamento por Funcionário (Geral)';
            }
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets[0].data = getChartData(currentMode, newMonths);
            chart.data.datasets[0].label = (currentMode === 'company') ?
                'Faturamento por Funcionário (Geral)' : 'Faturamento por Funcionário (Operação)';
            chart.update();
        }
    };
}

// New Chart 5: Contribution/Efficiency per Department (% of total earnings consumed)
function createContributionEfficiencyChart(data, months, departments) {
    const ctx = document.getElementById('contribution-efficiency-chart');
    if (!ctx) return null;

    const datasets = departments.map(dept => ({
        label: dept,
        data: months.map(month => {
            const deptCosts = data[month]?.departments[dept]?.geral || 0;
            const totalEarnings = data[month]?.earnings || 1; // Avoid division by zero
            return (totalEarnings > 0) ? (deptCosts / totalEarnings) * 100 : 0;
        }),
        backgroundColor: colorsByDepartment[dept] || "#ccc",
        borderColor: colorsByDepartment[dept] || "#ccc",
        stack: 'stack1'
    }));

    const chart = new Chart(ctx.getContext('2d'), {
        type: 'bar', // Stacked bar to show percentage contribution of each department to earnings "consumption"
        data: { labels: months.map(formatMonthShort), datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            let value = context.raw;
                            return `${context.dataset.label}: ${value.toFixed(2)}% do Faturamento`;
                        }
                    }
                },
                legend: { position: 'right', labels: { boxWidth: 12 } }
            },
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { callback: function(value) { return value.toFixed(0) + "%"; } }
                }
            }
        }
    });

    return {
        update: function(newMonths) {
            if (!chart) return;
            chart.data.labels = newMonths.map(formatMonthShort);
            chart.data.datasets.forEach(dataset => {
                const dept = dataset.label; // Assumes label is the department name
                dataset.data = newMonths.map(month => {
                    const deptCosts = data[month]?.departments[dept]?.geral || 0;
                    const totalEarnings = data[month]?.earnings || 1;
                    return (totalEarnings > 0) ? (deptCosts / totalEarnings) * 100 : 0;
                });
            });
            chart.update();
        }
    };
}


// --- DASHBOARD INITIALIZATION ---
Chart.defaults.devicePixelRatio = window.devicePixelRatio; // Optimize chart rendering for screen resolution

function initDashboard() {
    try {
        // Basic data validation
        if (!data || !Array.isArray(data.months) || !Array.isArray(data.departments) || typeof data.data !== 'object' || data.months.length === 0) {
            throw new Error('Invalid or incomplete data received from server. Cannot initialize dashboard.');
        }

        // Setup UI view toggles (Gastos, Faturamento, Tabelas)
        setupViewToggle();
        setupTableToggle(); // Setup table toggle logic

        // Initialize all chart instances, storing them in the 'charts' global object
        charts = {
            totalExpenditures: createTotalExpendituresChart(data.data, data.months, data.departments),
            departmentTrends: createDepartmentTrendsChart(data.data, data.months, data.departments),
            avgExpenditure: createAvgExpenditureChart(data.data, data.months),
            employees: createEmployeesChart(data.data, data.months),
            percentageStacked: createPercentageStackedChart(data.data, data.months, data.departments),
            departmentBreakdown: createDepartmentBreakdownCharts(data.data, data.months, data.departments), // Pie charts

            // New Earnings-related Charts
            earningsVsCosts: createEarningsVsCostsChart(data.data, data.months),
            netProfitLoss: createNetProfitLossChart(data.data, data.months),
            profitMargin: createProfitMarginChart(data.data, data.months),
            earningsPerEmployee: createEarningsPerEmployeeChart(data.data, data.months),
            contributionEfficiency: createContributionEfficiencyChart(data.data, data.months, data.departments)
        };

        // Setup filter listeners for charts
        setupTimeFilters();

        // Trigger initial chart updates to set default views (e.g., 12 months, 'All' departments)
        setTimeout(() => {
            try {
                // Set default department filters FIRST
                const totalExpDeptBtn = document.querySelector('#total-expenditures-wrapper .filter-buttons .filter-btn[data-department="all"]');
                if (totalExpDeptBtn) {
                    document.querySelectorAll('#total-expenditures-wrapper .filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                    totalExpDeptBtn.classList.add('active');
                }

                const deptTrendsDeptBtn = document.querySelector('#department-trends-wrapper .filter-buttons .filter-btn[data-departments="all"]');
                if (deptTrendsDeptBtn) {
                    document.querySelectorAll('#department-trends-wrapper .filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                    deptTrendsDeptBtn.classList.add('active');
                }

                // Then set default time filters and trigger chart updates
                const totalExpTimeBtn = document.querySelector('#total-expenditures-wrapper .time-btn[data-months="12"]');
                if (totalExpTimeBtn) {
                    document.querySelectorAll('#total-expenditures-wrapper .time-btn').forEach(btn => btn.classList.remove('active'));
                    totalExpTimeBtn.classList.add('active');
                    // Directly call update with default states
                    charts.totalExpenditures.update(data.data, getMonthsToShow(data.months, '12'), 'all');
                }

                const deptTrendsTimeBtn = document.querySelector('#department-trends-wrapper .time-btn[data-months="12"]');
                if (deptTrendsTimeBtn) {
                    document.querySelectorAll('#department-trends-wrapper .time-btn').forEach(btn => btn.classList.remove('active'));
                    deptTrendsTimeBtn.classList.add('active');
                    // Directly call update with default states
                    charts.departmentTrends.update(getMonthsToShow(data.months, '12'), data.departments); // 'all' is data.departments
                }

                // For new earnings charts, ensure they are updated on initial load (assuming earnings-view is hidden at start)
                if (charts.earningsVsCosts) charts.earningsVsCosts.update(data.months);
                if (charts.netProfitLoss) charts.netProfitLoss.update(data.months);
                if (charts.profitMargin) charts.profitMargin.update(data.months);
                if (charts.earningsPerEmployee) charts.earningsPerEmployee.update(data.months, 'company'); // Default to company-wide
                if (charts.contributionEfficiency) charts.contributionEfficiency.update(data.months);

            } catch (initFilterError) {
                console.error('Error during initial chart filter setup:', initFilterError);
            }
        }, 300); // Small delay to ensure all elements are rendered
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        showError('Falha ao carregar o dashboard. Por favor, recarregue a página.');
    }
}

// Function to display an error message to the user
function showError(message) {
    const container = document.querySelector('.container') || document.body;
    // Clear existing content to show error prominently
    container.innerHTML = `
        <div class="error-message">
            <h2>Erro</h2>
            <p>${message}</p>
            <button onclick="window.location.reload()">
                Recarregar Página
            </button>
        </div>
    `;
}
