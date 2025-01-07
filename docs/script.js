// Constants for income types and their spread directions
const INCOME_TYPES = {
    severance: { name: 'מענק פרישה', canSpreadForward: true },
    'death-grant': { name: 'מענק עקב פטירה', canSpreadForward: true },
    'pension-cap': { name: 'היוון קצבה', canSpreadForward: true },
    'salary-diff': { name: 'הפרשי שכר וקצבה', canSpreadForward: false },
    vacation: { name: 'פידיון ימי חופשה', canSpreadForward: false },
    'pension-sequence': { name: 'חזרה מרצף קצבה', canSpreadForward: false },
    'severance-sequence': { name: 'חזרה מרצף פיצויים', canSpreadForward: false },
    'maternity-reserve': { name: 'דמי לידה/מילואים', canSpreadForward: false }
};

// Tax brackets for years 2018-2024
const TAX_BRACKETS = {
    2025: [[84120, 0.1], [120720, 0.14], [193800, 0.2], [269280, 0.31], [560280, 0.35], [721560, 0.47], [Infinity, 0.5]],
    2024: [[81480, 0.1], [116760, 0.14], [187440, 0.2], [260520, 0.31], [542160, 0.35], [698280, 0.47], [Infinity, 0.5]],
    2023: [[77400, 0.1], [110880, 0.14], [178080, 0.2], [247440, 0.31], [514920, 0.35], [663240, 0.47], [Infinity, 0.5]],
    2022: [[75480, 0.1], [108360, 0.14], [173880, 0.2], [241680, 0.31], [502920, 0.35], [647640, 0.47], [Infinity, 0.5]],
    2021: [[75960, 0.1], [108960, 0.14], [174960, 0.2], [243120, 0.31], [505920, 0.35], [651600, 0.47], [Infinity, 0.5]],
    2020: [[75720, 0.1], [108600, 0.14], [174360, 0.2], [242400, 0.31], [504360, 0.35], [649560, 0.47], [Infinity, 0.5]],
    2019: [[74880, 0.1], [107400, 0.14], [172320, 0.2], [239520, 0.31], [498360, 0.35], [641880, 0.47], [Infinity, 0.5]]
};

// Variable to store the chart instance
let currentChart = null;

// חישוב שנות וותק בין תאריך תחילת עבודה לתאריך פרישה
function calculateWorkYears(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return 0;
    }

    if (start >= end) {
        return 0;
    }

    const yearsDiff = end.getFullYear() - start.getFullYear();
    const monthsDiff = end.getMonth() - start.getMonth();
    const daysDiff = end.getDate() - start.getDate();
    
    let totalMonths = yearsDiff * 12 + monthsDiff + (daysDiff >= 0 ? 0 : -1);
    let years = Math.floor(totalMonths / 12);
    let months = totalMonths % 12;
    
    const workYearsDisplay = document.getElementById('work-years-display');
    if (workYearsDisplay) {
        workYearsDisplay.textContent = `ותק: ${years} שנים ו-${months} חודשים`;
    }
    
    return Math.max(0, Math.round(totalMonths / 6) / 2); // Round to nearest 0.5
}

// חישוב מספר שנות פריסה אפשריות
function calculateSpreadYears(workYears) {
    const spreadYears = Math.round(workYears / 4 * 2) / 2;
    return Math.max(2, Math.min(6, spreadYears));
}

// חישוב המס בהתחשב בסכום ההכנסה ובשנת הפריסה
function calculateTax(income, year, gender) {
    if (income === undefined || year === undefined || gender === undefined) {
        console.error('Missing parameters in calculateTax:', { income, year, gender });
        return 0;
    }

    const brackets = TAX_BRACKETS[Math.min(year, 2025)];
    if (!brackets || !Array.isArray(brackets) || brackets.length === 0) {
        console.error('Invalid tax brackets for year:', year);
        return 0;
    }

    let tax = 0;
    for (let i = 0; i < brackets.length; i++) {
        const [bracket, rate] = brackets[i];
        const taxable = i === 0 ? Math.min(income, bracket) : Math.max(0, Math.min(income - brackets[i-1][0], bracket - brackets[i-1][0]));
        tax += taxable * rate;
        if (income <= bracket) break;
    }

    const creditPoints = gender === 'male' ? 2.25 : 2.75;
    const taxCredit = creditPoints * 2904;
    return Math.max(0, tax - taxCredit);
}

// חישוב מס הפריסה
function calculateSpreadTax(data, spreadYears, direction = 'forward', delay = false) {
    console.log('Calculate spread tax input:', { data, spreadYears, direction, delay });
    
    const totalIncome = data.incomeAmount;
    const annualSpread = totalIncome / spreadYears;
    const incomeDate = new Date(data.incomeDate);
    const incomeYear = incomeDate.getFullYear();
    let totalTax = 0;
    const taxPerYear = [];
    
    let yearsRange;
    let annualIncomes;
    
    if (direction === 'forward') {
        // If delay is true, start from next year
        const startYear = delay ? incomeYear + 1 : incomeYear;
        yearsRange = Array.from({length: spreadYears}, (_, i) => startYear + i);
        annualIncomes = data.expectedAnnualIncomes || {};
    } else {
        yearsRange = Array.from({length: spreadYears}, (_, i) => incomeYear - i).reverse();
        annualIncomes = data.pastAnnualIncomes || {};
    }
    
    for (let i = 0; i < yearsRange.length; i++) {
        const year = yearsRange[i];
        const baseIncome = annualIncomes[year] || 0;
        const totalYearIncome = baseIncome + annualSpread;
        const tax = calculateTax(totalYearIncome, year, data.gender);
        const baseTax = calculateTax(baseIncome, year, data.gender);
        const spreadTax = tax - baseTax;
        totalTax += spreadTax;
        taxPerYear.push([year, spreadTax]);
    }
    
    console.log('Tax per year calculated:', taxPerYear);
    
    return [totalTax, taxPerYear];
}

// עיבוד הנתונים והכנת התוצאות להצגה
function processData(data) {
    console.log('Processing data:', data);
    
    const spreadYears = calculateSpreadYears(data.workYears);
    const incomeDate = new Date(data.incomeDate);
    const incomeYear = incomeDate.getFullYear();
    
    const noSpreadTax = calculateTax(data.incomeAmount + (data.expectedAnnualIncomes[incomeYear] || 0), incomeYear, data.gender) -
                        calculateTax(data.expectedAnnualIncomes[incomeYear] || 0, incomeYear, data.gender);
    
    const results = {
        noSpread: {
            title: "ללא פריסה",
            tax: noSpreadTax,
            netIncome: data.incomeAmount - noSpreadTax,
            averageTaxRate: (noSpreadTax / data.incomeAmount) * 100
        },
        forwardSpread: [],
        delaySpread: [],
        backwardSpread: null,
        bestOption: null
    };
    
    // Forward spread without delay
    for (let years = 2; years <= spreadYears; years++) {
        const [spreadTax, taxPerYear] = calculateSpreadTax(data, years, 'forward');
        results.forwardSpread.push({
            title: `פריסה קדימה - ${years} שנים`,
            years,
            tax: spreadTax,
            netIncome: data.incomeAmount - spreadTax,
            averageTaxRate: (spreadTax / data.incomeAmount) * 100,
            taxPerYear
        });
    }
    
    // Forward spread with delay
    const canDelay = incomeDate.getMonth() >= 8;
    if (canDelay) {
        const maxDelayYears = incomeDate.getDate() >= 30 ? Math.floor(spreadYears) : Math.floor(spreadYears) - 1;
        for (let years = 2; years <= maxDelayYears; years++) {
            const [spreadTax, taxPerYear] = calculateSpreadTax(data, years, 'forward', true);
            results.delaySpread.push({
                title: `פריסה קדימה עם דחייה - ${years} שנים`,
                years,
                tax: spreadTax,
                netIncome: data.incomeAmount - spreadTax,
                averageTaxRate: (spreadTax / data.incomeAmount) * 100,
                taxPerYear
            });
        }
    }
    
    // Backward spread
    if (data.calculateBackward) {
        const backwardYears = Math.min(Math.floor(data.workYears), 6);
        const [backwardTax, backwardTaxPerYear] = calculateSpreadTax(data, backwardYears, 'backward');
        results.backwardSpread = {
            title: `פריסה אחורה - ${backwardYears} שנים`,
            years: backwardYears,
            tax: backwardTax,
            netIncome: data.incomeAmount - backwardTax,
            averageTaxRate: (backwardTax / data.incomeAmount) * 100,
            taxPerYear: backwardTaxPerYear
        };
    }
    
    // Find best option
    const allOptions = [
        results.noSpread,
        ...results.forwardSpread,
        ...results.delaySpread,
        ...(results.backwardSpread ? [results.backwardSpread] : [])
    ].sort((a, b) => a.tax - b.tax);

    // Find the option with lowest tax
    let bestOption = allOptions[0];
    let bestOptionNote = '';

    // Check if there's a better option with fewer years due to annual tax report cost
    if (bestOption.years) {  // Only for spread options
        const TAX_REPORT_COST = 1200;  // Annual tax report cost in NIS
        
        // Look for options with fewer years
        for (let i = 1; i < allOptions.length; i++) {
            const currentOption = allOptions[i];
            if (currentOption.years && currentOption.years < bestOption.years) {
                const taxDifference = currentOption.tax - bestOption.tax;
                if (taxDifference < TAX_REPORT_COST * (bestOption.years - currentOption.years)) {
                    bestOptionNote = `\nהערה: קיימת אפשרות לפריסה ל-${bestOption.years} שנים עם חיסכון נוסף של ${formatCurrency(bestOption.tax - currentOption.tax)} ש"ח, אך עלות הגשת דוח שנתי נוסף הופכת אפשרות זו ללא כדאית.`;
                    bestOption = currentOption;
                    break;
                }
            }
        }
    }

    results.bestOption = bestOption;
    results.bestOptionNote = bestOptionNote;
    
    return results;
}

// תצוגת התוצאות והצגת ההמלצה האופטימלית
function displayResults(results) {
    const resultsSection = document.getElementById('results');
    const noSpreadResult = document.getElementById('no-spread-result');
    const spreadOptionsNoDelay = document.getElementById('spread-options-no-delay');
    const spreadOptionsWithDelay = document.getElementById('spread-options-with-delay');
    const delaySpreadColumn = document.getElementById('delay-spread-column');
    const optimalResult = document.getElementById('optimal-result');
    const totalSavings = document.getElementById('total-savings');
    const taxTable = document.getElementById('tax-table');
    const newCalculationButton = document.getElementById('new-calculation-button');

    if (!resultsSection || !noSpreadResult || !spreadOptionsNoDelay || !optimalResult || !totalSavings) {
        console.error('Required elements not found in the DOM');
        return;
    }

    // Reset any existing content
    noSpreadResult.innerHTML = '';
    spreadOptionsNoDelay.innerHTML = '';
    if (spreadOptionsWithDelay) {
        spreadOptionsWithDelay.innerHTML = '';
    }
    optimalResult.innerHTML = '';

    // Show the results section and new calculation button
    resultsSection.style.display = 'block';
    if (newCalculationButton) {
        newCalculationButton.style.display = 'block';
    }

    // Display optimal result first
    if (results.bestOption) {
        let bestOptionHtml = createResultCard(results.bestOption, true);
        if (results.bestOptionNote) {
            bestOptionHtml += `<div class="alert alert-info mt-2">${results.bestOptionNote}</div>`;
        }
        optimalResult.innerHTML = bestOptionHtml;
    }

    // Display no spread result
    noSpreadResult.innerHTML = createResultCard(results.noSpread);

    // Display forward spread options
    let spreadOptionsNoDelayHtml = '';
    results.forwardSpread.forEach(option => {
        spreadOptionsNoDelayHtml += createResultCard(option);
    });
    spreadOptionsNoDelay.innerHTML = spreadOptionsNoDelayHtml;

    // Display delay spread options if available
    if (results.delaySpread.length > 0 && spreadOptionsWithDelay && delaySpreadColumn) {
        let spreadOptionsWithDelayHtml = '';
        results.delaySpread.forEach(option => {
            spreadOptionsWithDelayHtml += createResultCard(option);
        });
        spreadOptionsWithDelay.innerHTML = spreadOptionsWithDelayHtml;
        delaySpreadColumn.style.display = 'block';
    } else if (delaySpreadColumn) {
        delaySpreadColumn.style.display = 'none';
    }

    // Display total savings
    const savings = results.noSpread.tax - results.bestOption.tax;
    totalSavings.textContent = `חיסכון כולל: ${formatCurrency(savings)}`;

    // Create tax table
    if (taxTable) {
        let tableRows = '';
        const isDelayBest = results.bestOption?.title?.includes('דחייה');
        const relevantOptions = isDelayBest ? results.delaySpread : results.forwardSpread;
        
        // Add no spread option (1 year)
        tableRows += `
            <tr>
                <td>1</td>
                <td>${formatCurrency(results.noSpread.tax)}</td>
            </tr>
        `;

        // Add spread options
        relevantOptions.forEach(option => {
            tableRows += `
                <tr>
                    <td>${option.years}</td>
                    <td>${formatCurrency(option.tax)}</td>
                </tr>
            `;
        });

        taxTable.innerHTML = `
            <table class="tax-table">
                <thead>
                    <tr>
                        <th>שנות פריסה</th>
                        <th>סה"כ מס</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }

    // Keep all dropdown contents closed by default
    const dropdownContents = resultsSection.querySelectorAll('.dropdown-content');
    dropdownContents.forEach(content => {
        content.style.display = 'none';
        const button = content.closest('.result-category').querySelector('.dropdown-toggle');
        if (button) {
            button.textContent = '▼';
            button.setAttribute('aria-expanded', 'false');
        }
    });

    // Render the results chart
    renderResultsChart(results);

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function createResultCard(option, isBestOption = false) {
    if (!option) return '';
    
    // שמירת המידע בdata attributes בלי להציג אותו
    let taxYearsHtml = '';
    if (option.taxPerYear) {
        taxYearsHtml = '<div class="tax-years" style="display: none;">';
        option.taxPerYear.forEach(([year, tax]) => {
            taxYearsHtml += `<div class="tax-year" data-year="${year}" data-tax="${tax}"></div>`;
        });
        taxYearsHtml += '</div>';
    }
    
    return `
        <div class="result-card${isBestOption ? ' best-option' : ''}">
            <h3>${option.title || 'תוצאה'}</h3>
            <div class="result-details">
                <p>סך המס: <span data-tax="${option.tax}">${formatCurrency(option.tax)}</span></p>
                <p>סכום המענק נטו: ${formatCurrency(option.netIncome)}</p>
                <p>שיעור מס ממוצע: ${option.averageTaxRate.toFixed(1)}%</p>
                ${taxYearsHtml}
            </div>
            ${isBestOption ? '<div class="best-option-label">האפשרות הטובה ביותר</div>' : ''}
        </div>
    `;
}

function renderResultsChart(results) {
    const canvas = document.getElementById('results-chart');
    
    // Destroy existing chart if it exists
    if (window.taxChart instanceof Chart) {
        window.taxChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    const chartData = [
        results.noSpread,
        ...results.forwardSpread,
        ...results.delaySpread,
        results.backwardSpread
    ].filter(Boolean);

    // Create new chart and store it in the global variable
    window.taxChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.map(r => r.title),
            datasets: [{
                label: 'סכום המס',
                data: chartData.map(r => r.tax),
                backgroundColor: chartData.map(r => r === results.bestOption ? 'rgba(75, 192, 192, 0.6)' : 'rgba(54, 162, 235, 0.6)'),
                borderColor: chartData.map(r => r === results.bestOption ? 'rgb(75, 192, 192)' : 'rgb(54, 162, 235)'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'סכום המס (₪)'
                    },
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'השוואת אפשרויות פריסת מס'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatCurrency(context.raw);
                        }
                    }
                }
            }
        }
    });
}

// חישוב סך ההכנסות והכנות דינמיות להזנה
function createDynamicInputs(containerId, startYear, endYear) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    for (let year = startYear; year <= endYear; year++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        
        const label = document.createElement('label');
        label.textContent = `${year}`;
        label.htmlFor = `${containerId}-${year}`;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `${containerId}-${year}`;
        input.name = `${containerId}-${year}`;
        input.placeholder = `הכנסה`;
        input.min = '0';
        input.step = '1';
        
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        container.appendChild(wrapper);
    }
}

// עדכון השדות הדינמיים לפי סוג המענק ושנות הפריסה
function updateDynamicInputs() {
    const workStartDateInput = document.getElementById('work-start-date');
    const incomeDateInput = document.getElementById('income-date');
    const incomeTypeSelect = document.getElementById('income-type');

    const workStartDate = new Date(workStartDateInput.value);
    const incomeDate = new Date(incomeDateInput.value);
    const workYears = calculateWorkYears(workStartDate, incomeDate);
    const currentYear = incomeDate.getFullYear();
    const spreadYears = calculateSpreadYears(workYears);

    const incomeType = incomeTypeSelect.value;
    const forwardSpreadTypes = ['severance', 'death-grant', 'pension-cap'];
    const isForwardSpread = forwardSpreadTypes.includes(incomeType);

    const forwardSection = document.getElementById('forward-section');
    const backwardSection = document.getElementById('backward-section');

    if (forwardSection && backwardSection) {
        if (isForwardSpread) {
            forwardSection.style.display = 'block';
            backwardSection.style.display = 'none';
            createDynamicInputs('expected-incomes', currentYear, currentYear + Math.floor(spreadYears));
        } else {
            forwardSection.style.display = 'none';
            backwardSection.style.display = 'block';
            createDynamicInputs('past-incomes', Math.max(currentYear - Math.floor(workYears), 2019), currentYear - 1);
        }
    }
}

// בדיקת תקינות תאריכים
function validateDateInputs() {
    const workStartDate = document.getElementById('work-start-date').value;
    const incomeDate = document.getElementById('income-date').value;
    
    if (!workStartDate || !incomeDate) {
        return true; // Allow continued input
    }

    const workStartDateObj = new Date(workStartDate);
    const incomeDateObj = new Date(incomeDate);
    
    if (isNaN(workStartDateObj.getTime()) || isNaN(incomeDateObj.getTime())) {
        alert('נא להזין תאריכים תקפים.');
        return false;
    }
    
    if (workStartDateObj >= incomeDateObj) {
        alert('תאריך תחילת העבודה חייב להיות לפני תאריך הפרישה.');
        return false;
    }
    return true;
}

// פונקציות הדפסה וייצוא ל-PDF
function printResults() {
    window.print();
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const resultsSection = document.getElementById('results');
    if (!resultsSection) {
        console.error('Results section not found');
        return;
    }

    html2canvas(resultsSection).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4',
        });

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('tax_spread_results.pdf');
    });
}

// איפוס טופס והתחלת חישוב מחדש
function resetForm() {
    const form = document.getElementById('tax-spread-form');
    if (form) {
        form.reset();
        // Remove old event listener
        form.removeEventListener('submit', handleFormSubmit);
        // Add new event listener
        form.addEventListener('submit', handleFormSubmit);
    }

    const expectedIncomes = document.getElementById('expected-incomes');
    if (expectedIncomes) {
        expectedIncomes.innerHTML = '';
    }

    const pastIncomes = document.getElementById('past-incomes');
    if (pastIncomes) {
        pastIncomes.innerHTML = '';
    }

    const results = document.getElementById('results');
    if (results) {
        results.style.display = 'none';
    }

    const newCalculationButton = document.getElementById('new-calculation-button');
    if (newCalculationButton) {
        newCalculationButton.style.display = 'none';
    }

    const workYearsDisplay = document.getElementById('work-years-display');
    if (workYearsDisplay) {
        workYearsDisplay.textContent = '';
    }

    // Destroy existing chart if it exists
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }

    // Reinitialize the calculator
    initializeCalculator();
}

// טיפול בהגשת הטופס
function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateDateInputs()) {
        return;
    }

    const formData = {
        incomeType: document.getElementById('income-type').value,
        incomeAmount: parseFloat(document.getElementById('income-amount').value),
        incomeDate: document.getElementById('income-date').value,
        workStartDate: document.getElementById('work-start-date').value,
        workYears: calculateWorkYears(
            document.getElementById('work-start-date').value,
            document.getElementById('income-date').value
        ),
        gender: document.querySelector('input[name="gender"]:checked')?.value,
        expectedAnnualIncomes: {},
        pastAnnualIncomes: {}
    };

    if (!formData.incomeType || !formData.incomeAmount || !formData.incomeDate || !formData.workStartDate || !formData.gender) {
        alert('נא למלא את כל השדות החובה');
        return;
    }

    // Collect expected annual incomes
    const expectedInputs = document.querySelectorAll('#expected-incomes input');
    if (expectedInputs) {
        expectedInputs.forEach(input => {
            if (input && input.id) {
                const year = parseInt(input.id.split('-')[2]);
                if (!isNaN(year)) {
                    formData.expectedAnnualIncomes[year] = parseFloat(input.value) || 0;
                }
            }
        });
    }

    // Collect past annual incomes
    const pastInputs = document.querySelectorAll('#past-incomes input');
    if (pastInputs) {
        pastInputs.forEach(input => {
            if (input && input.id) {
                const year = parseInt(input.id.split('-')[2]);
                if (!isNaN(year)) {
                    formData.pastAnnualIncomes[year] = parseFloat(input.value) || 0;
                }
            }
        });
    }

    try {
        const results = processData(formData);
        console.log('Processed results:', results);
        displayResults(results);
    } catch (error) {
        console.error('Error processing form data:', error);
        alert('אירעה שגיאה בעיבוד הנתונים. אנא נסה שנית.');
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
}

// אתחול והפעלת המחשבון
function initializeEventListeners() {
    const workStartDateInput = document.getElementById('work-start-date');
    if (workStartDateInput) {
        workStartDateInput.addEventListener('blur', function() {
            if (validateDateInputs()) {
                updateDynamicInputs();
            }
        });
    }

    const incomeDateInput = document.getElementById('income-date');
    if (incomeDateInput) {
        incomeDateInput.addEventListener('blur', function() {
            if (validateDateInputs()) {
                updateDynamicInputs();
            }
        });
    }

    const incomeTypeSelect = document.getElementById('income-type');
    if (incomeTypeSelect) {
        incomeTypeSelect.addEventListener('change', updateDynamicInputs);
    }

    const taxSpreadForm = document.getElementById('tax-spread-form');
    if (taxSpreadForm) {
        taxSpreadForm.addEventListener('submit', handleFormSubmit);
    }

    const newCalculationButton = document.getElementById('new-calculation-button');
    if (newCalculationButton) {
        newCalculationButton.addEventListener('click', resetForm);
    }

    const printButton = document.getElementById('print-button');
    if (printButton) {
        printButton.addEventListener('click', printResults);
    }

    const pdfExportButton = document.getElementById('pdf-export-button');
    if (pdfExportButton) {
        pdfExportButton.addEventListener('click', exportToPDF);
    }
}

function toggleDropdown(button) {
    const content = button.closest('.result-category').querySelector('.dropdown-content');
    if (content) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        button.textContent = isHidden ? '▲' : '▼';
        
        // Update button aria-label for accessibility
        button.setAttribute('aria-label', isHidden ? 'הסתר תוצאות' : 'הצג תוצאות');
        button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    }
}

function initializeCalculator() {
    const currentDate = new Date();
    const incomeDateInput = document.getElementById('income-date');
    if (incomeDateInput) {
        incomeDateInput.valueAsDate = currentDate;
        incomeDateInput.setAttribute('placeholder', 'DD/MM/YYYY');
    }

    const workStartDateInput = document.getElementById('work-start-date');
    if (workStartDateInput) {
        workStartDateInput.valueAsDate = null;
        workStartDateInput.setAttribute('placeholder', 'DD/MM/YYYY');
    }

    // Initialize income type select options
    const incomeTypeSelect = document.getElementById('income-type');
    if (incomeTypeSelect) {
        // Clear existing options
        incomeTypeSelect.innerHTML = '<option value="">בחר סוג מענק</option>';
        
        // Add new options
        Object.entries(INCOME_TYPES).forEach(([value, type]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = type.name;
            incomeTypeSelect.appendChild(option);
        });
    }

    updateDynamicInputs();
    initializeEventListeners();
}

document.addEventListener('DOMContentLoaded', initializeCalculator);

// יצירת סיכום מילולי של החישוב
function generateSummary(results, data) {
    const bestOption = results.bestOption;
    const noSpreadOption = results.noSpread;
    const savings = noSpreadOption.tax - bestOption.tax;
    const incomeYear = new Date(data.incomeDate).getFullYear();
    
    let summaryText = '';
    
    // פרטי ההכנסה
    summaryText += `קיבלת מענק בסך ${formatCurrency(data.incomeAmount)} בשנת ${incomeYear}.\n\n`;
    
    // ההמלצה האופטימלית
    summaryText += `ההמלצה האופטימלית היא ${bestOption.title}.\n`;
    summaryText += `באפשרות זו תשלם מס בסך ${formatCurrency(bestOption.tax)} במקום ${formatCurrency(noSpreadOption.tax)}`;
    summaryText += ` (חיסכון של ${formatCurrency(savings)}).\n\n`;
    
    // חובת הגשת דוחות
    const isDelayOption = bestOption.title?.includes('דחייה');
    const reportYears = new Set();
    
    // הוספת שנות הפריסה
    if (bestOption.taxPerYear) {
        bestOption.taxPerYear.forEach(([year]) => reportYears.add(year));
    }
    
    // הוספת שנת הדחייה אם רלוונטי
    if (isDelayOption) {
        reportYears.add(incomeYear);
    }
    
    // מיון השנים
    const sortedYears = Array.from(reportYears).sort();
    summaryText += `עליך להגיש דוחות שנתיים בגין השנים ${sortedYears.join(', ')}.`;
    
    return summaryText;
}

function showSummary() {
    // בדיקה אם יש תוצאות
    const resultsSection = document.getElementById('results');
    if (resultsSection.style.display === 'none') {
        alert('אנא בצע חישוב תחילה');
        return;
    }
    
    // שליפת הנתונים מהשדות
    const incomeAmount = parseFloat(document.getElementById('income-amount').value);
    const incomeDate = document.getElementById('income-date').value;
    
    const data = {
        incomeAmount,
        incomeDate,
        expectedAnnualIncomes: {},
        pastAnnualIncomes: {}
    };
    
    // שליפת ההכנסות השנתיות
    const incomeYear = new Date(incomeDate).getFullYear();
    const incomeInputs = document.querySelectorAll('[id^="income-"]');
    incomeInputs.forEach(input => {
        const match = input.id.match(/income-(\d+)/);
        if (match && input.value) {
            const year = parseInt(match[1]);
            const value = parseFloat(input.value) || 0;
            if (year >= incomeYear) {
                data.expectedAnnualIncomes[year] = value;
            } else {
                data.pastAnnualIncomes[year] = value;
            }
        }
    });
    
    // שליפת התוצאות הקיימות
    const bestOptionCard = document.querySelector('#optimal-result .result-card');
    const noSpreadCard = document.querySelector('#no-spread-result .result-card');
    
    if (!bestOptionCard || !noSpreadCard) {
        alert('לא נמצאו תוצאות חישוב');
        return;
    }
    
    const results = {
        bestOption: {
            title: bestOptionCard.querySelector('h3').textContent,
            tax: parseFloat(bestOptionCard.querySelector('[data-tax]').dataset.tax),
            taxPerYear: Array.from(bestOptionCard.querySelectorAll('.tax-year')).map(el => {
                const year = parseInt(el.dataset.year);
                const tax = parseFloat(el.dataset.tax);
                return [year, tax];
            })
        },
        noSpread: {
            tax: parseFloat(noSpreadCard.querySelector('[data-tax]').dataset.tax)
        }
    };
    
    // יצירת הסיכום והצגתו
    const summaryText = generateSummary(results, data);
    
    // הצגת הסיכום בחלון מודאלי
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>סיכום החישוב</h2>
            <pre>${summaryText}</pre>
            <button onclick="copyToClipboard(this.previousElementSibling.textContent)" class="action-button">
                <i class="fas fa-copy"></i> העתק לזיכרון
            </button>
        </div>
    `;
    
    // סגירת המודאל
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => modal.remove();
    
    // סגירה בלחיצה מחוץ למודאל
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    document.body.appendChild(modal);
}

// פונקציה להעתקת טקסט ללוח
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('הטקסט הועתק ללוח');
    }).catch(err => {
        console.error('שגיאה בהעתקה:', err);
        alert('שגיאה בהעתקה');
    });
}
