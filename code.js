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
    const ctx = document.getElementById('results-chart').getContext('2d');
    const chartData = [
        results.noSpread,
        ...results.forwardSpread,
        ...results.delaySpread,
        results.backwardSpread
    ].filter(Boolean);

    new Chart(ctx, {
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

document.getElementById('work-years').addEventListener('input', updateDynamicInputs);
document.getElementById('income-date').addEventListener('change', updateDynamicInputs);
document.getElementById('calculate-backward').addEventListener('change', updateDynamicInputs);

document.getElementById('tax-spread-form').addEventListener('submit', function(e) {
    e.preventDefault();

    const formData = {
        incomeType: document.getElementById('income-type').value,
        incomeAmount: parseFloat(document.getElementById('income-amount').value),
        incomeDate: document.getElementById('income-date').value,
        workYears: parseFloat(document.getElementById('work-years').value),
        gender: document.querySelector('input[name="gender"]:checked').value,
        expectedAnnualIncomes: {},
        pastAnnualIncomes: {},
        calculateBackward: document.getElementById('calculate-backward').checked
    };

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
});

document.getElementById('new-calculation-button').addEventListener('click', function() {
    document.getElementById('tax-spread-form').reset();
    document.getElementById('expected-incomes').innerHTML = '';
    document.getElementById('past-incomes').innerHTML = '';
    document.getElementById('results').style.display = 'none';
    document.getElementById('tax-spread-form').style.display = 'block';
    const currentDate = new Date();
    document.getElementById('income-date').valueAsDate = currentDate;
    window.scrollTo(0, 0);
});

document.addEventListener('DOMContentLoaded', function() {
    const currentDate = new Date();
    document.getElementById('income-date').valueAsDate = currentDate;
    updateDynamicInputs();
});
