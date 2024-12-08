// Tax brackets for years 2018-2024
const TAX_BRACKETS = {
    2024: [[84120, 0.1], [120720, 0.14], [193800, 0.2], [269280, 0.31], [560280, 0.35], [721560, 0.47], [Infinity, 0.5]],
    2023: [[81480, 0.1], [116760, 0.14], [187440, 0.2], [260520, 0.31], [542160, 0.35], [698280, 0.47], [Infinity, 0.5]],
    2022: [[77400, 0.1], [110880, 0.14], [178080, 0.2], [247440, 0.31], [514920, 0.35], [663240, 0.47], [Infinity, 0.5]],
    2021: [[75480, 0.1], [108360, 0.14], [173880, 0.2], [241680, 0.31], [502920, 0.35], [647640, 0.47], [Infinity, 0.5]],
    2020: [[75960, 0.1], [108960, 0.14], [174960, 0.2], [243120, 0.31], [505920, 0.35], [651600, 0.47], [Infinity, 0.5]],
    2019: [[75720, 0.1], [108600, 0.14], [174360, 0.2], [242400, 0.31], [504360, 0.35], [649560, 0.47], [Infinity, 0.5]],
    2018: [[74880, 0.1], [107400, 0.14], [172320, 0.2], [239520, 0.31], [498360, 0.35], [641880, 0.47], [Infinity, 0.5]]
};

function calculateSpreadYears(workYears) {
    const spreadYears = Math.round(workYears / 4 * 2) / 2;
    return Math.max(2, Math.min(6, spreadYears));
}

function calculateTax(income, year, gender) {
    const brackets = TAX_BRACKETS[Math.min(year, 2024)];
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

function calculateSpreadTax(data, spreadYears, direction = 'forward', delay = false) {
    const totalIncome = data.incomeAmount;
    const annualSpread = totalIncome / spreadYears;
    const incomeYear = new Date(data.incomeDate).getFullYear();
    let totalTax = 0;
    const taxPerYear = [];
    
    let yearsRange;
    let annualIncomes;
    
    if (direction === 'forward') {
        const startYear = incomeYear + (delay ? 1 : 0);
        yearsRange = Array.from({length: spreadYears}, (_, i) => startYear + i);
        annualIncomes = data.expectedAnnualIncomes;
    } else {
        yearsRange = Array.from({length: spreadYears}, (_, i) => incomeYear - i).reverse();
        annualIncomes = {...data.pastAnnualIncomes, ...data.expectedAnnualIncomes};
    }
    
    for (const year of yearsRange) {
        const baseIncome = annualIncomes[year] || 0;
        const totalYearIncome = baseIncome + annualSpread;
        const tax = calculateTax(totalYearIncome, year, data.gender);
        const baseTax = calculateTax(baseIncome, year, data.gender);
        const spreadTax = tax - baseTax;
        totalTax += spreadTax;
        taxPerYear.push([year, spreadTax]);
    }
    
    return [totalTax, taxPerYear];
}

function processData(data) {
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
    ];
    
    results.bestOption = allOptions.reduce((best, current) => 
        current.tax < best.tax ? current : best
    );
    
    return results;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
}

function createResultCard(option, isBest = false) {
    return `
        <div class="result-card ${isBest ? 'best-option' : ''}">
            <h4><i class="fas fa-chart-line"></i> ${option.title}</h4>
            <p><i class="fas fa-money-bill-wave"></i> סך המס: ${formatCurrency(option.tax)}</p>
            <p><i class="fas fa-hand-holding-usd"></i> הכנסה נטו: ${formatCurrency(option.netIncome)}</p>
            <p><i class="fas fa-percent"></i> שיעור מס ממוצע: ${option.averageTaxRate.toFixed(1)}%</p>
        </div>
    `;
}

function displayResults(results) {
    const resultsSection = document.getElementById('results');
    const noSpreadResult = document.getElementById('no-spread-result');
    const spreadOptionsNoDelay = document.getElementById('spread-options-no-delay');
    const spreadOptionsWithDelay = document.getElementById('spread-options-with-delay');
    const delaySpreadColumn = document.getElementById('delay-spread-column');
    const optimalResult = document.getElementById('optimal-result');
    const totalSavings = document.getElementById('total-savings');
    
    noSpreadResult.innerHTML = createResultCard(results.noSpread);
    
    let spreadOptionsNoDelayHtml = '';
    results.forwardSpread.forEach(option => {
        spreadOptionsNoDelayHtml += createResultCard(option);
    });
    if (results.backwardSpread) {
        spreadOptionsNoDelayHtml += createResultCard(results.backwardSpread);
    }
    spreadOptionsNoDelay.innerHTML = spreadOptionsNoDelayHtml;
    
    if (results.delaySpread.length > 0) {
        let spreadOptionsWithDelayHtml = '';
        results.delaySpread.forEach(option => {
            spreadOptionsWithDelayHtml += createResultCard(option);
        });
        spreadOptionsWithDelay.innerHTML = spreadOptionsWithDelayHtml;
        delaySpreadColumn.style.display = 'block';
    } else {
        delaySpreadColumn.style.display = 'none';
    }
    
    optimalResult.innerHTML = createResultCard(results.bestOption, true);
    
    const savings = results.noSpread.tax - results.bestOption.tax;
    totalSavings.textContent = `חיסכון כולל: ${formatCurrency(savings)}`;
    
    renderResultsChart(results);
    
    resultsSection.style.display = 'block';
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
                }
            }
        }
    });
}

function createDynamicInputs(containerId, startYear, endYear) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    for (let year = startYear; year <= endYear; year++) {
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `${containerId}-${year}`;
        input.name = `${containerId}-${year}`;
        input.placeholder = `הכנסה לשנת ${year}`;
        input.min = '0';
        input.step = '0.01';
        container.appendChild(input);
    }
}

function updateDynamicInputs() {
    const workYears = parseFloat(document.getElementById('work-years').value) || 0;
    const incomeDate = new Date(document.getElementById('income-date').value);
    const currentYear = incomeDate.getFullYear();
    const spreadYears = calculateSpreadYears(workYears);

    createDynamicInputs('expected-incomes', currentYear, currentYear + Math.floor(spreadYears));
    
    const backwardSection = document.getElementById('backward-section');
    if (document.getElementById('calculate-backward').checked) {
        backwardSection.style.display = 'block';
        createDynamicInputs('past-incomes', Math.max(currentYear - Math.floor(workYears), 2018), currentYear - 1);
    } else {
        backwardSection.style.display = 'none';
    }
}

function handleFormSubmit(e) {
    e.preventDefault();

    const formData = {
        incomeType: document.getElementById('income-type').value,
        incomeAmount: parseFloat(document.getElementById('income-amount').value),
        incomeDate: document.getElementById('income-date').value,
        workYears: parseFloat(document.getElementById('work-years').value),
        gender: document.querySelector('input[name="gender"]:checked')?.value,
        expectedAnnualIncomes: {},
        pastAnnualIncomes: {},
        calculateBackward: document.getElementById('calculate-backward').checked
    };

    // Validate required fields
    if (!formData.incomeType || !formData.incomeAmount || !formData.incomeDate || 
        !formData.workYears || !formData.gender) {
        alert('נא למלא את כל השדות החובה');
        return;
    }

    const expectedInputs = document.querySelectorAll('#expected-incomes input');
    expectedInputs.forEach(input => {
        const year = parseInt(input.id.split('-')[2]);
        formData.expectedAnnualIncomes[year] = parseFloat(input.value) || 0;
    });

    if (formData.calculateBackward) {
        const pastInputs = document.querySelectorAll('#past-incomes input');
        pastInputs.forEach(input => {
            const year = parseInt(input.id.split('-')[2]);
            formData.pastAnnualIncomes[year] = parseFloat(input.value) || 0;
        });
    }

    const results = processData(formData);
    displayResults(results);
}

function initializeForm() {
    const form = document.getElementById('tax-spread-form');
    const workYearsInput = document.getElementById('work-years');
    const incomeDateInput = document.getElementById('income-date');
    const calculateBackwardInput = document.getElementById('calculate-backward');
    
    // Set current date
    const currentDate = new Date();
    incomeDateInput.valueAsDate = currentDate;
    
    // Remove existing event listeners
    form.removeEventListener('submit', handleFormSubmit);
    workYearsInput.removeEventListener('input', updateDynamicInputs);
    incomeDateInput.removeEventListener('change', updateDynamicInputs);
    calculateBackwardInput.removeEventListener('change', updateDynamicInputs);
    
    // Add fresh event listeners
    form.addEventListener('submit', handleFormSubmit);
    workYearsInput.addEventListener('input', updateDynamicInputs);
    incomeDateInput.addEventListener('change', updateDynamicInputs);
    calculateBackwardInput.addEventListener('change', updateDynamicInputs);
    
    // Initialize dynamic inputs
    updateDynamicInputs();
}

document.getElementById('new-calculation-button').addEventListener('click', function() {
    // Reset form and clear fields
    const form = document.getElementById('tax-spread-form');
    form.reset();
    
    // Clear dynamic inputs
    document.getElementById('expected-incomes').innerHTML = '';
    document.getElementById('past-incomes').innerHTML = '';
    
    // Hide results and show form
    document.getElementById('results').style.display = 'none';
    document.getElementById('tax-spread-form').style.display = 'block';
    
    // Clear existing chart
    if (window.taxChart) {
        window.taxChart.destroy();
        window.taxChart = null;
    }
    
    // Reinitialize the form
    initializeForm();
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.addEventListener('DOMContentLoaded', initializeForm);

// Function to generate PDF
async function exportToPDF() {
    // Create a new container for PDF content
    const pdfContainer = document.createElement('div');
    pdfContainer.style.width = '210mm'; // A4 width
    pdfContainer.style.padding = '20px';
    pdfContainer.style.direction = 'rtl';
    pdfContainer.style.backgroundColor = 'white';
    
    // Add header
    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '20px';
    const now = new Date();
    header.innerHTML = `
        <h1 style="color: #2c3e50; margin-bottom: 10px; font-family: Rubik, sans-serif;">דו״ח פריסת מס</h1>
        <p style="color: #7f8c8d;">הופק בתאריך: ${now.toLocaleDateString('he-IL')} ${now.toLocaleTimeString('he-IL')}</p>
    `;
    pdfContainer.appendChild(header);

    // Add form data summary
    const formSummary = document.createElement('div');
    formSummary.style.marginBottom = '20px';
    formSummary.innerHTML = `
        <h2 style="color: #2c3e50; margin-bottom: 10px;">פרטי החישוב</h2>
        <p>סוג הכנסה: ${document.getElementById('income-type').options[document.getElementById('income-type').selectedIndex].text}</p>
        <p>סכום ההכנסה: ${formatCurrency(parseFloat(document.getElementById('income-amount').value))}</p>
        <p>תאריך: ${new Date(document.getElementById('income-date').value).toLocaleDateString('he-IL')}</p>
        <p>שנות עבודה: ${document.getElementById('work-years').value}</p>
        <p>מגדר: ${document.querySelector('input[name="gender"]:checked').value === 'male' ? 'גבר' : 'אישה'}</p>
    `;
    pdfContainer.appendChild(formSummary);

    // Add results
    const resultsContent = document.createElement('div');
    resultsContent.style.marginBottom = '20px';
    
    // Add optimal result
    const optimalResult = document.getElementById('optimal-result').cloneNode(true);
    const totalSavings = document.getElementById('total-savings').cloneNode(true);
    resultsContent.appendChild(optimalResult);
    resultsContent.appendChild(totalSavings);
    
    // Add other results
    ['no-spread-result', 'spread-options-no-delay', 'spread-options-with-delay'].forEach(id => {
        const element = document.getElementById(id);
        if (element && element.innerHTML.trim()) {
            resultsContent.appendChild(element.cloneNode(true));
        }
    });
    
    pdfContainer.appendChild(resultsContent);

    // Add chart
    if (window.taxChart) {
        const chartContainer = document.createElement('div');
        chartContainer.style.marginTop = '20px';
        chartContainer.style.marginBottom = '20px';
        chartContainer.style.height = '400px';
        
        const canvas = document.createElement('canvas');
        chartContainer.appendChild(canvas);
        
        // Create a new chart instance for PDF
        const ctx = canvas.getContext('2d');
        const chartData = window.taxChart.data;
        const chartOptions = window.taxChart.options;
        
        new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                ...chartOptions,
                animation: false,
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
        pdfContainer.appendChild(chartContainer);
    }

    // Configure PDF options
    const opt = {
        margin: [10, 10, 10, 10],
        filename: 'דוח_פריסת_מס.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2,
            useCORS: true,
            logging: true,
            allowTaint: true,
            foreignObjectRendering: true
        },
        jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait'
        }
    };

    try {
        // Add the container to the document temporarily
        document.body.appendChild(pdfContainer);
        
        // Generate PDF
        await html2pdf().set(opt).from(pdfContainer).save();
        
        // Remove the temporary container
        document.body.removeChild(pdfContainer);
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('אירעה שגיאה בייצוא ה-PDF. אנא נסה שוב.');
    }
}

// Add event listener for the export button
document.getElementById('export-button').addEventListener('click', exportToPDF);
