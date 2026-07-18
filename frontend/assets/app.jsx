const { useState, useEffect } = React;


    // --- ICONS (SVG Inline Components) ---
    const IconInfo = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    const IconUsers = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
    const IconBook = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
    const IconCpu = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>;
    const IconChevronRight = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
    const IconUpload = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24" style={{display: 'inline-block', verticalAlign: 'middle'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
    const IconCheck = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
    const IconDownload = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
    const IconAlertCircle = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    const IconFileText = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    const IconPieChart = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>;
    const IconActivity = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
    const IconLayers = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>;
    const IconDatabase = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>;
    const IconFilePlus = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    const IconBarChart2 = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '4px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 20V10m-6 10V4m-6 16v-8" /></svg>;
    const IconDashboard = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>;
    const IconDollar = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    const IconTrendingUp = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>;
    const IconFolder = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
    const IconSearch = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
    const IconCalculator = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
    const IconMenu = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
    const IconX = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
    const IconMessage = () => <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
    

    // --- TRANSLATIONS DICTIONARY (Bilingual support AZ / EN) ---

    function App() {
      const urlParams = new URLSearchParams(window.location.search);
      const isFeedbackPage = urlParams.get('page') === 'feedback';
      const [lang, setLang] = useState(() => localStorage.getItem('arpp_lang') || 'AZ');
      const [activeTab, setActiveTab] = useState(() => localStorage.getItem('arpp_activeTab') || (isFeedbackPage ? 'feedback' : 'home'));
      const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
      const [selectedCv, setSelectedCv] = useState(null);
      const [selectedArticle, setSelectedArticle] = useState(null);
      const [softwareTab, setSoftwareTab] = useState(() => localStorage.getItem('arpp_softwareTab') || 'pricing');
      const [officialDoc, setOfficialDoc] = useState('telimat');
      const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
      const [articleText, setArticleText] = useState('');
      const [pricingMenuExpanded, setPricingMenuExpanded] = useState(() => {
        const val = localStorage.getItem('arpp_pricingMenuExpanded');
        return val !== null ? JSON.parse(val) : true;
      });
      const [pricingSubTab, setPricingSubTab] = useState(() => localStorage.getItem('arpp_pricingSubTab') || 'premium');
      const [reserveMenuExpanded, setReserveMenuExpanded] = useState(() => {
        const val = localStorage.getItem('arpp_reserveMenuExpanded');
        return val !== null ? JSON.parse(val) : true;
      });
      const [formulaMenuExpanded, setFormulaMenuExpanded] = useState(() => {
        const val = localStorage.getItem('arpp_formulaMenuExpanded');
        return val !== null ? JSON.parse(val) : true;
      });
      const [docsMenuExpanded, setDocsMenuExpanded] = useState(() => {
        const val = localStorage.getItem('arpp_docsMenuExpanded');
        return val !== null ? JSON.parse(val) : true;
      });
      const [loadingArticle, setLoadingArticle] = useState(false);
      const [blogList, setBlogList] = useState(typeof blogArticles !== 'undefined' ? blogArticles : []);
      const [loadingBlog, setLoadingBlog] = useState(false);
      const [formulaCategory, setFormulaCategory] = useState('mortality');

      // Feedback form states
      const [feedbackEmail, setFeedbackEmail] = useState('');
      const [feedbackText, setFeedbackText] = useState('');
      const [feedbackStatus, setFeedbackStatus] = useState(null); // 'success', 'error', 'loading', null
      const [feedbackStatusMsg, setFeedbackStatusMsg] = useState('');
      const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

      const t = translations[lang];

      // App calculations state
      const [importedState, setImportedState] = useState({
        status: 'idle', 
        policyCount: 0,
        errors: 0,
        warnings: 0,
        fileName: ''
      });

      const [pricingParams, setPricingParams] = useState(() => {
        const val = localStorage.getItem('arpp_pricingParams');
        return val !== null ? JSON.parse(val) : {
          insuranceClass: 'life_survival_m_payments',
          valuationDate: '2026-01-01',
          birthDate: '1996-01-01',
          startDate: '2025-01-01',
          endDate: '2045-01-01',
          sumAssured: 100000,
          premium: 500,
          creditApr: 10,
          costAcquisitionInitial: 0.0,
          expenseMaintenance: 0.25,
          marginMortality: 3.0,
          marginInvestment: 1.5,
          costAcquisition: 0.3,
          paymentFrequency: 12,
          salary: 1500
        };
      });

      const [pricingResult, setPricingResult] = useState(null);

      const [reserveParams, setReserveParams] = useState(() => {
        const val = localStorage.getItem('arpp_reserveParams');
        return val !== null ? JSON.parse(val) : {
          policyId: 'POL-2401',
          valuationDate: '2026-01-01',
          birthDate: '1996-01-01',
          startDate: '2025-01-01',
          endDate: '2045-01-01',
          sumAssured: 100000,
          premium: 500,
          creditApr: 10,
          policyType: 'life_survival_m_payments',
          interest: 5.0,
          expenseMaintenance: 0.25,
          marginMortality: 3.0,
          marginInvestment: 1.5,
          costAcquisitionInitial: 0.0,
          costAcquisition: 0.3,
          paymentFrequency: 12
        };
      });

      const [reserveResult, setReserveResult] = useState(null);

      const [mortalityTable, setMortalityTable] = useState([]);
      const [globalInterestRate, setGlobalInterestRate] = useState(() => localStorage.getItem('arpp_globalInterestRate') || "5.0");

      useEffect(() => {
        localStorage.setItem('arpp_lang', lang);
      }, [lang]);

      useEffect(() => {
        localStorage.setItem('arpp_activeTab', activeTab);
      }, [activeTab]);

      useEffect(() => {
        localStorage.setItem('arpp_softwareTab', softwareTab);
      }, [softwareTab]);

      useEffect(() => {
        localStorage.setItem('arpp_pricingSubTab', pricingSubTab);
      }, [pricingSubTab]);

      useEffect(() => {
        localStorage.setItem('arpp_pricingMenuExpanded', JSON.stringify(pricingMenuExpanded));
      }, [pricingMenuExpanded]);

      useEffect(() => {
        localStorage.setItem('arpp_reserveMenuExpanded', JSON.stringify(reserveMenuExpanded));
      }, [reserveMenuExpanded]);

      useEffect(() => {
        localStorage.setItem('arpp_formulaMenuExpanded', JSON.stringify(formulaMenuExpanded));
      }, [formulaMenuExpanded]);

      useEffect(() => {
        localStorage.setItem('arpp_docsMenuExpanded', JSON.stringify(docsMenuExpanded));
      }, [docsMenuExpanded]);

      useEffect(() => {
        localStorage.setItem('arpp_pricingParams', JSON.stringify(pricingParams));
      }, [pricingParams]);

      useEffect(() => {
        localStorage.setItem('arpp_reserveParams', JSON.stringify(reserveParams));
      }, [reserveParams]);

      useEffect(() => {
        localStorage.setItem('arpp_globalInterestRate', globalInterestRate);
      }, [globalInterestRate]);

      useEffect(() => {
        if ((softwareTab === 'pricing' || softwareTab === 'formula-explorer')) {
          fetch('./assets/Monthlydeathtable.csv')
            .then(res => res.text())
            .then(text => {
              const lines = text.trim().split('\n').slice(1);
              const data = lines.map((line, idx) => {
                const parts = line.split(',');
                let x, lxStr, dxStr;
                if (parts.length > 3) {
                  x = parts[0];
                  dxStr = parts[parts.length - 1];
                  lxStr = parts.slice(1, parts.length - 1).join('').replace(/"/g, '');
                } else {
                  x = parts[0];
                  lxStr = parts[1]?.replace(/"/g, '');
                  dxStr = parts[2];
                }
                return { 
                  month: idx,
                  x: parseInt(x), 
                  lx: parseFloat(lxStr), 
                  dx: parseFloat(dxStr) 
                };
              });
              const v = 1.0 / (1.0 + (((parseFloat(globalInterestRate) || 0) / 100) / 12)); // using monthly interest rate
              // Recompute lx sequentially starting from month 2
              for (let i = 1; i < data.length; i++) {
                data[i].lx = data[i-1].lx - data[i-1].dx;
              }
              
              for (let i = 0; i < data.length; i++) {
                data[i].qx = data[i].dx / data[i].lx;
                const lx_plus_1 = i + 1 < data.length ? data[i+1].lx : 0;
                data[i].px = lx_plus_1 / data[i].lx;
                data[i].Dx = data[i].lx * Math.pow(v, i);
                data[i].Cx = data[i].dx * Math.pow(v, i + 1);
              }
              
              let Nx_sum = 0;
              let Mx_sum = 0;
              for (let i = data.length - 1; i >= 0; i--) {
                Nx_sum += data[i].Dx;
                Mx_sum += data[i].Cx;
                data[i].Nx = Nx_sum;
                data[i].Mx = Mx_sum;
              }
              
              setMortalityTable(data);
            })
            .catch(err => console.error(err));
        }
      }, [softwareTab, globalInterestRate]);      const [searchPolicyId, setSearchPolicyId] = useState('');
      const [searchedPolicy, setSearchedPolicy] = useState(null);

      const [reportsList, setReportsList] = useState([]);
      const [generatingReport, setGeneratingReport] = useState(null);

      const [serverWaking, setServerWaking] = useState(false);
      const [isCalculating, setIsCalculating] = useState(false);

      const handleFeedbackSubmit = async (e) => {
        e.preventDefault();
        setFeedbackStatus(null);
        setFeedbackStatusMsg('');
        
        const email = feedbackEmail.trim();
        const text = feedbackText.trim();
        
        if (!email) {
          setFeedbackStatus('error');
          setFeedbackStatusMsg(lang === 'AZ' ? 'Mail ünvanı məcburidir.' : 'Email is required.');
          return;
        }
        
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
          setFeedbackStatus('error');
          setFeedbackStatusMsg(lang === 'AZ' ? 'Düzgün bir e-mail ünvanı daxil edin.' : 'Please enter a valid email address.');
          return;
        }
        
        if (!text) {
          setFeedbackStatus('error');
          setFeedbackStatusMsg(lang === 'AZ' ? 'Rəy hissəsi boş ola bilməz.' : 'Feedback field cannot be empty.');
          return;
        }
        
        // Optimistic UI: Set success immediately to make it go as fast as possible!
        setFeedbackStatus('success');
        setFeedbackEmail('');
        setFeedbackText('');
        
        // Fire-and-forget fetch in the background
        const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
          ? 'http://localhost:8000'
          : 'https://actuary-it-com.onrender.com';
          
        fetch(`${API_BASE_URL}/api/feedback/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, message: text }),
        }).catch(error => {
          console.error('Background feedback send failed:', error);
        });
      };

      // --- ACTUARIAL CALCULATIONS FOR PRICING ENGINE ---
      const calculatePricing = async () => {
        setIsCalculating(true);
        try {
          const m = (pricingParams.insuranceClass === 'life_death_single_payment' || pricingParams.insuranceClass === 'life_survival_single_payment') ? 1 : (parseInt(pricingParams.paymentFrequency) || 12);
          const payload = {
            params: {
              valuation_date: pricingParams.valuationDate,
              interest_rate_annual: parseFloat(globalInterestRate) / 100 || 0,
              expense_maintenance: (parseFloat(pricingParams.expenseMaintenance) || 0) / 100,
              margin_mortality: (parseFloat(pricingParams.marginMortality) || 0) / 100,
              margin_investment: (parseFloat(pricingParams.marginInvestment) || 0) / 100,
              cost_acquisition_initial: (parseFloat(pricingParams.costAcquisitionInitial) || 0) / 100,
              cost_acquisition: (parseFloat(pricingParams.costAcquisition) || 0) / 100,
              payment_frequency: m
            },
            policy: {
              policy_id: "PRICING-1",
              dob: pricingParams.birthDate,
              inception_date: pricingParams.startDate,
              maturity_date: pricingParams.endDate,
              sum_insured_initial: parseFloat(pricingParams.sumAssured) || 1,
              net_premium: parseFloat(pricingParams.premium) || 0,
              credit_apr: parseFloat(pricingParams.creditApr) || 0,
              policy_type: pricingParams.insuranceClass
            }
          };

          const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
            ? 'http://localhost:8000'
            : 'https://actuary-it-com.onrender.com';
          
          const response = await fetch(`${API_BASE_URL}/api/valuation/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const res = await response.json();
          if (res.status === 'success') {
            const data = res.data;
            const Axn = data.Axn || 0.0;
            const axn = data.axn || 0.0;
            const Exn = data.nEx || 0.0;

            const i = parseFloat(globalInterestRate) / 100 || 0;
            const delta = i > 0 ? Math.log(1 + i) : 1;
            const continuous_adj = i > 0 ? (i / delta) : 1;
            const Axn_bar = Axn * continuous_adj;

            const ro1 = (parseFloat(pricingParams.marginMortality) || 0) / 100;
            const alpha = (parseFloat(pricingParams.costAcquisitionInitial) || 0) / 100;
            const gamma = (parseFloat(pricingParams.expenseMaintenance) || 0) / 100;
            const beta = (parseFloat(pricingParams.costAcquisition) || 0) / 100;

            const axm = m === 1 ? axn : (axn - ((m - 1) / (2 * m)) * (1 - Exn));

            const isSingle = (pricingParams.insuranceClass === 'life_death_single_payment' || pricingParams.insuranceClass === 'life_survival_single_payment');
            const denominator = isSingle ? (1 - beta) : (m * (1 - beta) * axm);
            const netDenominator = isSingle ? 1 : (m * axm);

            if (pricingSubTab === 'premium') {
              const S = parseFloat(pricingParams.sumAssured) || 0;
              const numerator = (1 + ro1) * S * Axn_bar + alpha * S + gamma * S * axn;
              const netNumerator = (1 + ro1) * S * Axn_bar;

              const Pm_gross = denominator > 0 ? (numerator / denominator) : 0;
              const Pm_net = netDenominator > 0 ? (netNumerator / netDenominator) : 0;

              const grossPremium = isSingle ? Pm_gross : Pm_gross * m;
              const netPremium = isSingle ? Pm_net : Pm_net * m;
              const monthlyPremium = isSingle ? Pm_gross : Pm_gross;

              setPricingResult({
                commutations: {
                  Dx: data.Dx || 0,
                  Nx: data.Nx || 0,
                  Cx: data.Cx || 0,
                  Mx: data.Mx || 0,
                  Axn: Axn,
                  axn: axn,
                  Exn: Exn,
                  axm: axm
                },
                netPremium: parseFloat(netPremium.toFixed(2)),
                grossPremium: parseFloat(grossPremium.toFixed(2)),
                monthlyPremium: parseFloat(monthlyPremium.toFixed(2))
              });
            } else {
              const Pm_gross = parseFloat(pricingParams.premium) || 0;
              const denominator_S = (1 + ro1) * Axn_bar + alpha + gamma * axn;
              const numerator_S = isSingle ? (Pm_gross * (1 - beta)) : (m * Pm_gross * (1 - beta) * axm);

              const calculatedS = denominator_S > 0 ? (numerator_S / denominator_S) : 0;

              setPricingResult({
                commutations: {
                  Dx: data.Dx || 0,
                  Nx: data.Nx || 0,
                  Cx: data.Cx || 0,
                  Mx: data.Mx || 0,
                  Axn: Axn,
                  axn: axn,
                  Exn: Exn,
                  axm: axm
                },
                calculatedSumAssured: parseFloat(calculatedS.toFixed(2))
              });
            }
          } else {
            alert(lang === 'AZ' ? 'Hesablama xətası: ' + res.message : 'Calculation error: ' + res.message);
          }
        } catch (error) {
          console.error(error);
          alert(lang === 'AZ' ? 'Xəta baş verdi' : 'An error occurred');
        } finally {
          setIsCalculating(false);
        }
      };

      useEffect(() => {
        const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
          ? 'http://localhost:8000'
          : 'https://actuary-it-com.onrender.com';

        // Setup a slow server detection timeout
        const wakeupTimeout = setTimeout(() => {
          setServerWaking(true);
        }, 1200);

        fetch(`${API_BASE_URL}/api/valuation/`)
          .then(res => res.json())
          .then(data => {
            clearTimeout(wakeupTimeout);
            setServerWaking(false);
          })
          .catch(err => {
            // Even if it fails (e.g. CORS or network error), it helped warm up the server
            clearTimeout(wakeupTimeout);
            setServerWaking(false);
          });

        // Auto-calculate on initial load so data is visible when page is refreshed
        calculateReserve();
        calculatePricing();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      const calculateReserve = async () => {
        setIsCalculating(true);
        try {
          const payload = {
            params: {
              valuation_date: reserveParams.valuationDate,
              interest_rate_annual: parseFloat(globalInterestRate) / 100 || 0,
              expense_maintenance: (parseFloat(reserveParams.expenseMaintenance) || 0) / 100,
              margin_mortality: (parseFloat(reserveParams.marginMortality) || 0) / 100,
              margin_investment: (parseFloat(reserveParams.marginInvestment) || 0) / 100,
              cost_acquisition_initial: (parseFloat(reserveParams.costAcquisitionInitial) || 0) / 100,
              cost_acquisition: (parseFloat(reserveParams.costAcquisition) || 0) / 100,
              payment_frequency: (reserveParams.policyType === 'life_death_single_payment' || reserveParams.policyType === 'life_survival_single_payment') ? 1 : (parseInt(reserveParams.paymentFrequency) || 12)
            },
            policy: {
              policy_id: reserveParams.policyId,
              dob: reserveParams.birthDate,
              inception_date: reserveParams.startDate,
              maturity_date: reserveParams.endDate,
              sum_insured_initial: parseFloat(reserveParams.sumAssured) || 0,
              net_premium: parseFloat(reserveParams.premium) || 0,
              credit_apr: parseFloat(reserveParams.creditApr) || 0,
              policy_type: reserveParams.policyType
            }
          };

          const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
            ? 'http://localhost:8000'
            : 'https://actuary-it-com.onrender.com';
          const response = await fetch(`${API_BASE_URL}/api/valuation/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const res = await response.json();
          if (res.status === 'success') {
            setReserveResult({
              policyId: reserveParams.policyId,
              currentYear: reserveParams.currentYear,
              engineData: res.data,
              tableData: []
            });
          } else {
            console.error(res.message);
            alert("Hesablama xətası: " + res.message);
          }
        } catch (error) {
          console.error(error);
          alert("Serverə qoşulmaq mümkün olmadı.");
        } finally {
          setIsCalculating(false);
        }
      };

      const searchPolicy = () => {
        if (!searchPolicyId) return;
        const mockDb = {
          'POL-2401': { id: 'POL-2401', cert: 'CERT-98210', name: 'Nurlan Aliyev', gender: 'Male', age: 34, product: 'Endowment', premium: 0, reserve: 0, status: 'Active' },
          'POL-2402': { id: 'POL-2402', cert: 'CERT-98211', name: 'Leyla Mammadova', gender: 'Female', age: 29, product: 'Term Life', premium: 0, reserve: 0, status: 'Active' },
          'POL-2403': { id: 'POL-2403', cert: 'CERT-98212', name: 'Emin Huseynov', gender: 'Male', age: 45, product: 'Annuity', premium: 0, reserve: 0, status: 'Active' }
        };
        const found = mockDb[searchPolicyId.toUpperCase()] || null;
        setSearchedPolicy(found);
      };

      const handleFileUpload = (e) => {
        setImportedState({
          status: 'success',
          policyCount: 250,
          errors: 0,
          warnings: 3,
          fileName: 'Policies.xlsx'
        });
      };

      const generateReportAction = (type) => {
        setGeneratingReport(type);
        setTimeout(() => {
          setReportsList(prev => [
            {
              id: `REP-${Math.floor(1000 + Math.random() * 9000)}`,
              type,
              date: new Date().toLocaleDateString(),
              size: '0.0 KB (Empty)'
            },
            ...prev
          ]);
          setGeneratingReport(null);
        }, 1200);
      };

      React.useEffect(() => {
        if (activeTab === 'blog') {
          setLoadingBlog(true);
          const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
            ? 'http://localhost:8000'
            : 'https://actuary-it-com.onrender.com';
            
          fetch(`${API_BASE_URL}/api/blog/`)
            .then(res => res.json())
            .then(data => {
              if (data.status === 'success' && data.data && data.data.length > 0) {
                setBlogList(data.data);
              }
            })
            .catch(err => console.error('Error fetching blog list:', err))
            .finally(() => setLoadingBlog(false));
        }
      }, [activeTab]);

      const openArticle = async (article, index) => {
        setSelectedArticle(article);
        setLoadingArticle(true);
        setArticleText('');
        
        const articleId = article.id || (index + 1);
        
        // Attempt to fetch from backend API first
        try {
          const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
            ? 'http://localhost:8000'
            : 'https://actuary-it-com.onrender.com';
            
          const response = await fetch(`${API_BASE_URL}/api/blog/${articleId}/`);
          const json = await response.json();
          if (response.ok && json.status === 'success') {
            setArticleText(json.data.content[lang] || '');
            setLoadingArticle(false);
            return;
          }
        } catch (err) {
          console.warn('Backend blog fetch failed, falling back to local files:', err);
        }
        
        // Fallback to local files
        try {
          const response = await fetch(`./blog/blog_${articleId}_${lang.toLowerCase()}.txt`);
          if (response.ok) {
            const text = await response.text();
            setArticleText(text);
          } else {
            setArticleText(lang === 'AZ' ? "Məqalə tapılmadı." : "Article not found.");
          }
        } catch (err) {
          setArticleText(lang === 'AZ' ? "Xəta baş verdi." : "An error occurred.");
        } finally {
          setLoadingArticle(false);
        }
      };

      return (
        <React.Fragment>
          <div className="bg-glow-container">
            <div className="bg-glow-1"></div>
            <div className="bg-glow-2"></div>
          </div>

          {/* HEADER NAV */}
          <header className="app-header">
            <div className="logo-area" onClick={() => { if (window.innerWidth <= 768) { setMobileMenuOpen(!mobileMenuOpen); } else { setActiveTab('home'); setMobileMenuOpen(false); } }} style={{ cursor: 'pointer' }}>
              <div className="logo-badge" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="desktop-logo">α</span>
                <span className="mobile-logo">{mobileMenuOpen ? <IconX /> : <IconMenu />}</span>
              </div>
              <span className="text-gradient-primary">ARPP</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <nav className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
                <button className={`nav-link ${activeTab === 'feedback' ? 'active' : ''}`} onClick={() => { setActiveTab('feedback'); setMobileMenuOpen(false); }}>
                  <IconMessage /> {lang === 'AZ' ? 'Rəy' : 'Feedback'}
                </button>
                <button className={`nav-link ${activeTab === 'actuaries' ? 'active' : ''}`} onClick={() => { setActiveTab('actuaries'); setMobileMenuOpen(false); }}>
                  <IconUsers /> {t.actuaries}
                </button>
                <button className={`nav-link ${activeTab === 'blog' ? 'active' : ''}`} onClick={() => { setActiveTab('blog'); setMobileMenuOpen(false); }}>
                  <IconBook /> {t.blog}
                </button>
                <button className={`nav-link ${activeTab === 'create-report' ? 'active' : ''}`} onClick={() => { setActiveTab('create-report'); setMobileMenuOpen(false); }}>
                  <IconCpu /> {t.createReport}
                </button>

              </nav>

              {/* Language Switcher */}
              <div className="lang-switcher">
                <button className={`lang-btn ${lang === 'AZ' ? 'active' : ''}`} onClick={() => setLang('AZ')}>AZ</button>
                <button className={`lang-btn ${lang === 'EN' ? 'active' : ''}`} onClick={() => setLang('EN')}>EN</button>
              </div>
            </div>
          </header>

          {/* LANDING PAGE: HOME */}
          {activeTab === 'home' && (
            <div style={{ padding: '2rem 5%', display: 'flex', flexDirection: 'column', gap: '4rem', alignItems: 'center' }}>
              
              <section className="landing-hero" style={{ maxWidth: '900px', margin: '4rem auto 2rem', textAlign: 'center', padding: '0 1rem' }}>
                <div className="hero-badge" style={{ animation: 'float 3s ease-in-out infinite' }}>
                  <span>🚀</span> {lang === 'AZ' ? 'Yeni Nəsil Hesablama Platforması' : 'Next-Gen Calculation Platform'}
                </div>
                <h1 className="hero-title text-gradient">
                  {lang === 'AZ' ? 'Aktuar Təhlilində' : 'The Future of'} <br />
                  <span className="text-gradient-primary">{lang === 'AZ' ? 'Gələcəyin Standartı' : 'Actuarial Analysis'}</span>
                </h1>
                <p className="hero-description">
                  {lang === 'AZ' 
                    ? 'ARPP (Actuary Calculator & Reporting Platform) vasitəsilə ən mürəkkəb riyazi modelləri saniyələr içində icra edin. Tarifləşdirmə, ehtiyatların qiymətləndirilməsi və beynəlxalq standartlara uyğun avtomatlaşdırılmış hesabatlar.'
                    : 'Execute the most complex mathematical models in seconds with ARPP. Pricing, reserve valuation, and automated reporting in compliance with international standards.'}
                </p>

                <div className="hero-buttons">
                  <button className="btn-primary" onClick={() => setActiveTab('create-report')} style={{ padding: '1rem 2.5rem', fontSize: '1.1rem', borderRadius: '50px' }}>
                    {t.btnStartPlatform} <span style={{ marginLeft: '8px' }}>→</span>
                  </button>
                  <button className="btn-secondary" onClick={() => setActiveTab('actuaries')} style={{ padding: '1rem 2.5rem', fontSize: '1.1rem', borderRadius: '50px' }}>
                    {t.btnMeetActuaries}
                  </button>
                </div>
              </section>



              {/* CTA Section */}
              <div className="glass-card" style={{ width: '100%', maxWidth: '1100px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '3rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    {lang === 'AZ' ? 'Hazırsınız?' : 'Are you ready?'}
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '1.5rem' }}>
                    {lang === 'AZ' ? 'Sığorta ehtiyatlarınızı və portfelinizi müasir platformamızda idarə edərək fərqi hiss edin.' : 'Feel the difference by managing your insurance reserves and portfolio on our modern platform.'}
                  </p>
                </div>
                <button className="btn-primary" onClick={() => setActiveTab('create-report')} style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                  {t.createReport} <span style={{ marginLeft: '8px' }}>→</span>
                </button>
              </div>
            </div>
          )}

          {/* ACTUARIES DIRECTORY */}
          {activeTab === 'actuaries' && (
            <div className="cards-container">
              <div className="section-header">
                <h2 className="section-title text-gradient">{t.ourActuariesTitle}</h2>
                <p className="section-subtitle">{t.ourActuariesSub}</p>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.actuaryClickPrompt}</span>
              </div>
              
              <div className="actuary-profile-grid">
                {/* Bahman Orujov CV Card */}
                <div className="glass-card profile-card" onClick={() => setSelectedCv(cvData)}>
                  <div className="profile-header">
                    <div className="profile-avatar" style={{background: 'linear-gradient(135deg, var(--color-secondary) 0%, var(--color-primary) 100%)'}}>BO</div>
                    <div className="profile-info">
                      <h3>{cvData.name}</h3>
                      <p>{cvData.title[lang]}</p>
                    </div>
                  </div>
                  <p className="profile-body">
                    {lang === 'AZ' 
                      ? "Mega Life-da Həyat sığortası ehtiyat hesablamalarının avtomatlaşdırılması, Flask analitik dashboard panelinin qurulması üzrə ixtisaslaşmışdır."
                      : "Specialized in automating life reserving and building Flask analytical dashboards at Mega Life."}
                  </p>
                  <div className="profile-skills">
                    <span className="skill-tag">Python & SQL</span>
                    <span className="skill-tag">Actuarial Reserving</span>
                    <span className="skill-tag">VBA</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CV DETAIL MODAL */}
          {selectedCv && (
            <div className="modal-overlay" onClick={() => setSelectedCv(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setSelectedCv(null)}>✕</button>
                
                <div className="cv-header-container">
                  <div className="profile-avatar">BO</div>
                  <div>
                    <h2 style={{fontSize: '1.75rem', fontWeight: 800}} className="text-gradient-primary">{selectedCv.name}</h2>
                    <p style={{color: 'var(--color-tertiary)', fontWeight: 600}}>{selectedCv.title[lang]}</p>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{selectedCv.location}</p>
                  </div>
                </div>

                <div className="cv-contact-grid">
                  <div>📧 <strong>Email:</strong> {selectedCv.email}</div>
                  <div>🔗 <strong>LinkedIn:</strong> <a href={`https://${selectedCv.linkedin}`} target="_blank" style={{color: 'var(--color-primary)'}}>{selectedCv.linkedin}</a></div>
                  <div>📞 <strong>Phone:</strong> {selectedCv.phone}</div>
                  <div>🌐 <strong>{t.cvLang}:</strong> {selectedCv.languages[lang]}</div>
                </div>

                {/* Experience */}
                <h3 className="cv-section-title">💼 {t.cvExp}</h3>
                {selectedCv.experience.map((exp, idx) => (
                  <div key={idx} className="cv-item">
                    <div className="cv-item-title">
                      <span>{exp.role[lang]}</span>
                      <span style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{exp.period}</span>
                    </div>
                    <div className="cv-item-company">{exp.company}</div>
                    <ul className="cv-item-desc">
                      {exp.bullets[lang].map((bullet, bidx) => (
                        <li key={bidx}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* Education */}
                <h3 className="cv-section-title">🎓 {t.cvEdu}</h3>
                {selectedCv.education.map((edu, idx) => (
                  <div key={idx} className="cv-item" style={{marginBottom: '0.75rem'}}>
                    <div className="cv-item-title">
                      <span>{edu.degree[lang]}</span>
                      <span style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{edu.period}</span>
                    </div>
                    <div style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>{edu.inst}</div>
                  </div>
                ))}

                {/* Technical Skills */}
                <h3 className="cv-section-title">🛠️ {t.cvSkills}</h3>
                <ul className="cv-item-desc" style={{paddingLeft: '1.25rem'}}>
                  {selectedCv.skills[lang].map((sk, idx) => (
                    <li key={idx} style={{marginBottom: '0.4rem'}}>{sk}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* BLOG */}
          {activeTab === 'blog' && (
            <div className="cards-container">
              <div className="section-header">
                <h2 className="section-title text-gradient">{t.blogTitle}</h2>
                <p className="section-subtitle">{t.blogSub}</p>
              </div>
              <div className="blog-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                {blogList.map((article, idx) => (
                  <div key={idx} className="glass-card blog-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="blog-img-placeholder" style={{ fontSize: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {article.icon}
                    </div>
                    <div className="blog-meta">
                      <span>{article.date[lang]}</span>
                      <span>•</span>
                      <span>{t.readTime}: {article.readTime} dəq</span>
                    </div>
                    <h3 className="blog-title" style={{ flexGrow: 1 }}>{article.title[lang]}</h3>
                    <p className="blog-excerpt">{article.excerpt[lang]}</p>
                    <span className="read-more-link" onClick={() => openArticle(article, idx)} style={{ cursor: 'pointer', display: 'inline-block' }}>
                      {t.blogReadMore} <span>→</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ARTICLE DETAIL MODAL */}
          {selectedArticle && (
            <div className="modal-overlay" onClick={() => setSelectedArticle(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                <button className="modal-close" onClick={() => setSelectedArticle(null)}>✕</button>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem'}}>
                  <div style={{fontSize: '3rem'}}>{selectedArticle.icon}</div>
                  <div>
                    <h2 style={{fontSize: '1.5rem', fontWeight: 800}} className="text-gradient-primary">{selectedArticle.title[lang]}</h2>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem'}}>
                      {selectedArticle.date[lang]} • {t.readTime}: {selectedArticle.readTime} dəq
                    </p>
                  </div>
                </div>

                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem', fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                  {loadingArticle ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
                      <div className="spinner"></div>
                    </div>
                  ) : (
                    <React.Fragment>
                      {articleText.split('\n').map((para, pIdx) => (
                        <p key={pIdx} style={{ marginBottom: '1rem' }}>{para}</p>
                      ))}
                      {selectedArticle.sourceUrl && (
                        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                          <a href={selectedArticle.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            🌐 {lang === 'AZ' ? "Mənbəyə keç" : "Go to Source"}
                          </a>
                        </div>
                      )}
                    </React.Fragment>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ACTUARIAL APPLICATION */}
          {activeTab === 'create-report' && (
            <div className="software-container">
              {/* SIDEBAR */}
              <aside className={`software-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
                <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                  {sidebarOpen ? <IconX /> : <IconMenu />}
                </button>
                <div className="sidebar-heading">{sidebarOpen ? t.sidebarEngines : '...'}</div>
                <button 
                   className={`sidebar-btn ${softwareTab === 'pricing' ? 'active' : ''}`} 
                   onClick={() => {
                     if (!sidebarOpen) {
                       setSidebarOpen(true);
                       setPricingMenuExpanded(true);
                     } else {
                       setPricingMenuExpanded(!pricingMenuExpanded);
                     }
                     setSoftwareTab('pricing');
                   }}
                   style={{ display: 'flex', alignItems: 'center', width: '100%' }}
                 >
                   <IconDollar /> 
                   <span className="sidebar-btn-text">{t.pricingEngine}</span>
                   {sidebarOpen && (
                     <span className={`sidebar-btn-chevron ${pricingMenuExpanded ? 'expanded' : ''}`} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                       <IconChevronRight />
                     </span>
                   )}
                 </button>
                 {sidebarOpen && pricingMenuExpanded && (
                   <div className="sidebar-submenu">
                     <button 
                       className={`sidebar-sub-btn ${softwareTab === 'pricing' && pricingSubTab === 'premium' ? 'active' : ''}`} 
                       onClick={() => {
                         setSoftwareTab('pricing');
                         setPricingSubTab('premium');
                       }}
                       title={lang === 'AZ' ? 'Sığorta haqqı' : 'Premium'}
                     >
                       <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>●</span>
                       <span>
                         {lang === 'AZ' ? 'Sığorta haqqı' : 'Premium'}
                       </span>
                     </button>
                     <button 
                       className={`sidebar-sub-btn ${softwareTab === 'pricing' && pricingSubTab === 'sum_assured' ? 'active' : ''}`} 
                       onClick={() => {
                         setSoftwareTab('pricing');
                         setPricingSubTab('sum_assured');
                       }}
                       title={lang === 'AZ' ? 'Sığorta məbləği' : 'Sum Assured'}
                     >
                       <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>●</span>
                       <span>
                         {lang === 'AZ' ? 'Sığorta məbləği' : 'Sum Assured'}
                       </span>
                     </button>
                   </div>
                 )}
                <button 
                  className={`sidebar-btn ${softwareTab === 'reserve' ? 'active' : ''}`} 
                  onClick={() => {
                    if (!sidebarOpen) {
                      setSidebarOpen(true);
                      setReserveMenuExpanded(true);
                    } else {
                      setReserveMenuExpanded(!reserveMenuExpanded);
                    }
                    setSoftwareTab('reserve');
                  }}
                  style={{ display: 'flex', alignItems: 'center', width: '100%' }}
                >
                  <IconTrendingUp /> 
                  <span className="sidebar-btn-text">{t.reserveEngine}</span>
                  {sidebarOpen && (
                    <span className={`sidebar-btn-chevron ${reserveMenuExpanded ? 'expanded' : ''}`} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <IconChevronRight />
                    </span>
                  )}
                </button>
                {sidebarOpen && reserveMenuExpanded && (
                  <div className="sidebar-submenu">
                    <button 
                      className={`sidebar-sub-btn ${softwareTab === 'reserve' ? 'active' : ''}`} 
                      onClick={() => setSoftwareTab('reserve')}
                      title={lang === 'AZ' ? 'Uzunmüddətli öhdəliklər ehtiyatı (Riyazi ehtiyat)' : 'Reserve for Long-Term Liabilities (Mathematical Reserve)'}
                    >
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>●</span>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        maxWidth: '180px' 
                      }}>
                        {lang === 'AZ' ? 'Uzunmüddətli öhdəliklər ehtiyatı (Riyazi ehtiyat)' : 'Reserve for Long-Term Liabilities'}
                      </span>
                    </button>
                  </div>
                )}
                <div className="sidebar-heading">{sidebarOpen ? t.sidebarAnalytics : '...'}</div>
                <button 
                  className={`sidebar-btn ${softwareTab === 'formula-explorer' ? 'active' : ''}`} 
                  onClick={() => {
                    if (!sidebarOpen) {
                      setSidebarOpen(true);
                      setFormulaMenuExpanded(true);
                    } else {
                      setFormulaMenuExpanded(!formulaMenuExpanded);
                    }
                    setSoftwareTab('formula-explorer');
                  }}
                  style={{ display: 'flex', alignItems: 'center', width: '100%' }}
                >
                  <IconCalculator /> 
                  <span className="sidebar-btn-text">{t.formulaExplorer}</span>
                  {sidebarOpen && (
                    <span className={`sidebar-btn-chevron ${formulaMenuExpanded ? 'expanded' : ''}`} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <IconChevronRight />
                    </span>
                  )}
                </button>
                {sidebarOpen && formulaMenuExpanded && (
                  <div className="sidebar-submenu">
                    <button 
                      className={`sidebar-sub-btn ${softwareTab === 'formula-explorer' && formulaCategory === 'mortality' ? 'active' : ''}`} 
                      onClick={() => {
                        setSoftwareTab('formula-explorer');
                        setFormulaCategory('mortality');
                      }}
                      title={lang === 'AZ' ? 'Aylıq Ölüm Cədvəli və Kommutasiya Ədədləri (1272 Ay)' : 'Monthly Mortality Table & Commutation (1272 Months)'}
                    >
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>●</span>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        maxWidth: '180px' 
                      }}>
                        {lang === 'AZ' ? 'Ölüm Cədvəli' : 'Mortality Table'}
                      </span>
                    </button>
                  </div>
                )}

                <button 
                  className={`sidebar-btn ${softwareTab === 'official-docs' ? 'active' : ''}`} 
                  onClick={() => {
                    if (!sidebarOpen) {
                      setSidebarOpen(true);
                      setDocsMenuExpanded(true);
                    } else {
                      setDocsMenuExpanded(!docsMenuExpanded);
                    }
                    setSoftwareTab('official-docs');
                  }}
                  style={{ display: 'flex', alignItems: 'center', width: '100%' }}
                >
                  <IconBook /> 
                  <span className="sidebar-btn-text">{t.officialDocs}</span>
                  {sidebarOpen && (
                    <span className={`sidebar-btn-chevron ${docsMenuExpanded ? 'expanded' : ''}`} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <IconChevronRight />
                    </span>
                  )}
                </button>
                {sidebarOpen && docsMenuExpanded && (
                  <div className="sidebar-submenu">
                    <button 
                      className={`sidebar-sub-btn ${softwareTab === 'official-docs' && officialDoc === 'telimat' ? 'active' : ''}`} 
                      onClick={() => {
                        setSoftwareTab('official-docs');
                        setOfficialDoc('telimat');
                      }}
                      title={lang === 'AZ' ? 'Aktuar Hesablamalar Təlimatı' : 'Actuarial Calculations Instruction'}
                    >
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>●</span>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        maxWidth: '180px' 
                      }}>
                        {lang === 'AZ' ? 'Aktuar Hesablamalar Təlimatı' : 'Actuarial Calculations Instruction'}
                      </span>
                    </button>
                    <button 
                      className={`sidebar-sub-btn ${softwareTab === 'official-docs' && officialDoc === 'qaydalar' ? 'active' : ''}`} 
                      onClick={() => {
                        setSoftwareTab('official-docs');
                        setOfficialDoc('qaydalar');
                      }}
                      title={lang === 'AZ' ? 'Sığorta Ehtiyatları Qaydası' : 'Insurance Reserves Regulation'}
                    >
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>●</span>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        maxWidth: '180px' 
                      }}>
                        {lang === 'AZ' ? 'Sığorta Ehtiyatları Qaydası' : 'Insurance Reserves Regulation'}
                      </span>
                    </button>
                  </div>
                )}
              </aside>

              <main className="software-content">
                {serverWaking && (
                  <div className="glass-card" style={{
                    marginBottom: '1.5rem',
                    padding: '1rem 1.5rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderLeft: '4px solid #ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    animation: 'pulse 2s infinite'
                  }}>
                    <span style={{ fontSize: '1.5rem' }}>⏳</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
                        {lang === 'AZ' ? 'Server oyanır...' : 'Server is waking up...'}
                      </strong>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {lang === 'AZ' 
                          ? 'Render serveri yuxu rejimindədir və oyanır. İlk hesablama təxminən 30-50 saniyə çəkə bilər, zəhmət olmasa gözləyin...' 
                          : 'Render server is currently asleep and is waking up. The first calculation may take 30-50 seconds, please wait...'}
                      </span>
                    </div>
                    <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                  </div>
                )}
                {/* SUB-TAB: DASHBOARD */}
                {softwareTab === 'dashboard' && (
                  <div>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.dashboard}</h2>
                    <div className="kpi-grid">
                      <div className="glass-card kpi-card">
                        <div className="kpi-header">
                          <span>{t.kpiPolicies}</span>
                          <span>📈</span>
                        </div>
                        <div className="kpi-value">{importedState.status === 'success' ? '250' : '0'}</div>
                        <div className="kpi-footer">{lang === 'AZ' ? 'İdxal edilmiş ümumi say' : 'Total imported count'}</div>
                      </div>
                      <div className="glass-card kpi-card">
                        <div className="kpi-header">
                          <span>{t.kpiAge}</span>
                          <span>👤</span>
                        </div>
                        <div className="kpi-value">{importedState.status === 'success' ? '36.8' : '0.0'}</div>
                        <div className="kpi-footer">Policies</div>
                      </div>
                      <div className="glass-card kpi-card">
                        <div className="kpi-header">
                          <span>{t.kpiPremium}</span>
                          <span>💰</span>
                        </div>
                        <div className="kpi-value">
                          {importedState.status === 'success' ? '1,120,450 AZN' : '0 AZN'}
                        </div>
                        <div className="kpi-footer">{lang === 'AZ' ? 'Yazılmış ümumi premium' : 'Total written premium'}</div>
                      </div>
                      <div className="glass-card kpi-card">
                        <div className="kpi-header">
                          <span>{t.kpiReserve}</span>
                          <span>🛡️</span>
                        </div>
                        <div className="kpi-value">
                          {importedState.status === 'success' ? '452,180 AZN' : '0 AZN'}
                        </div>
                        <div className="kpi-footer">{lang === 'AZ' ? 'Hesablanmış ehtiyatlar' : 'Calculated reserves'}</div>
                      </div>
                    </div>

                    <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem', borderLeft: '4px solid var(--primary-color)' }}>
                      <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>{lang === 'AZ' ? 'Modullar Haqqında Məlumat' : 'About Software Modules'}</h3>
                      <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)' }}>
                        <li><strong style={{ color: 'var(--text-primary)' }}>Pricing Engine (Qiymətləndirmə):</strong> {lang === 'AZ' ? 'Həyat və Qeyri-həyat sığorta məhsulları üçün müasir aktuari modelləri ilə tariflərin və mükafatların hesablanması.' : 'Calculation of tariffs and premiums using modern actuarial models for Life and Non-Life insurance products.'}</li>
                        <li><strong style={{ color: 'var(--text-primary)' }}>Reserve Engine (Ehtiyatlar):</strong> {lang === 'AZ' ? 'Qazanılmamış mükafat ehtiyatı (QME), baş vermiş ancaq bildirilməmiş zərərlər (BABBZ) və digər texniki ehtiyatların hesablanması.' : 'Calculation of Unearned Premium Reserves (UPR), Incurred But Not Reported (IBNR) and other technical reserves.'}</li>
                        <li><strong style={{ color: 'var(--text-primary)' }}>{lang === 'AZ' ? 'Ölüm cədvəli:' : 'Mortality table:'}</strong> {lang === 'AZ' ? 'Həyat sığortası riyaziyyatı üçün 1272 aylıq (106 illik) ölüm ehtimalları və kommutasiya ədədləri bazası.' : 'A 1272-month (106-year) mortality probabilities and commutation numbers database for life insurance mathematics.'}</li>
                        <li><strong style={{ color: 'var(--text-primary)' }}>Portfolio Dashboard:</strong> {lang === 'AZ' ? 'Sığorta portfelinin demoqrafik, risk və gəlirlilik göstəricilərinin vizual analizi.' : 'Visual analysis of demographic, risk, and profitability metrics of the insurance portfolio.'}</li>
                      </ul>
                    </div>

                    <div className="glass-card" style={{ marginBottom: '2rem' }}>
                      <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>{t.systemStatus}</h3>
                      {importedState.status === 'idle' ? (
                        <div style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: 'var(--text-secondary)' }}>
                          {t.noDataWarning}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{t.activePortfolio}:</span>
                            <strong className="text-gradient-primary">{importedState.fileName}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{t.validationErrors}:</span>
                            <span className="badge badge-success">{importedState.errors} {lang==='AZ'?'Xəta':'Error'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{t.warnings}:</span>
                            <span className="badge badge-warning">{importedState.warnings} {lang==='AZ'?'Xəbərdarlıq':'Warning'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SUB-TAB: IMPORT DATA */}
                {softwareTab === 'import-data' && (
                  <div>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.importData}</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{t.importDesc}</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem' }}>1. Policies.xlsx</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {lang === 'AZ' ? 'Müqavilə ID, müştəri adı, məhsul, başlama tarixi, sığorta məbləği, premium və s.' : 'Policy ID, customer name, product, start date, sum assured, premium etc.'}
                        </p>
                        <button className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }} onClick={handleFileUpload}>
                          {t.fileSelectMock}
                        </button>
                      </div>
                      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem' }}>2. Monthlydeathtable.csv</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {lang === 'AZ' ? 'Aylıq ölüm cədvəli (X, l(x), d(x) sütunları, aylıq addımlarla).' : 'Monthly death table (X, l(x), d(x) columns, with monthly steps).'}
                        </p>
                        <button className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }} onClick={handleFileUpload}>
                          {t.fileSelectMock}
                        </button>
                      </div>
                      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem' }}>3. Interest Rate.xlsx</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {lang === 'AZ' ? 'Daxili diskont və ssenari dərəcələri (Scenario, Annual Interest).' : 'Internal discount and scenario rates (Scenario, Annual Interest).'}
                        </p>
                        <button className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }} onClick={handleFileUpload}>
                          {t.fileSelectMock}
                        </button>
                      </div>
                    </div>

                    {importedState.status === 'success' && (
                      <div className="glass-card" style={{ background: 'rgba(16, 185, 129, 0.03)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                        <h3 style={{ color: 'var(--color-success)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {t.validationSuccess}
                        </h3>
                        <div className="table-container">
                          <table className="custom-table">
                            <thead>
                              <tr>
                                <th>{t.metricName}</th>
                                <th>{t.metricRule}</th>
                                <th>{t.metricStatus}</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>{t.labelAge}</td>
                                <td>0 - 120</td>
                                <td><span className="badge badge-success">{t.statusSuccess}</span></td>
                              </tr>
                              <tr>
                                <td>{t.labelSum}</td>
                                <td>&gt; 0</td>
                                <td><span className="badge badge-success">{t.statusSuccess}</span></td>
                              </tr>
                              <tr>
                                <td>Premium</td>
                                <td>&gt; 0</td>
                                <td><span className="badge badge-success">{t.statusSuccess}</span></td>
                              </tr>
                              <tr>
                                <td>{lang === 'AZ' ? 'Faiz (Interest)' : 'Interest'}</td>
                                <td>&ge; 0</td>
                                <td><span className="badge badge-success">{t.statusSuccess}</span></td>
                              </tr>
                              <tr>
                                <td>{lang === 'AZ' ? 'Təkrarlanan Müqavilə' : 'Duplicate Policy'}</td>
                                <td>{lang === 'AZ' ? 'Təkrarsız' : 'No Duplicates'}</td>
                                <td><span className="badge badge-success">{lang === 'AZ' ? 'Mövcud deyil' : 'None'}</span></td>
                              </tr>
                              <tr>
                                <td>{lang === 'AZ' ? 'Boş Xanalar' : 'Empty Cells'}</td>
                                <td>{lang === 'AZ' ? 'Boş Xana Yoxdur' : 'No Empty Cells'}</td>
                                <td><span className="badge badge-warning">{t.statusWarning}</span></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-TAB: PRICING ENGINE */}
                {softwareTab === 'pricing' && (
                  <div>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                      {lang === 'AZ' 
                        ? `Tarif Modulu - ${pricingSubTab === 'premium' ? 'Sığorta haqqı' : 'Sığorta məbləği'}` 
                        : `Pricing Engine - ${pricingSubTab === 'premium' ? 'Premium' : 'Sum Assured'}`
                      }
                    </h2>
                    <div className="responsive-grid-2">
                      {/* Inputs */}
                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>{t.pricingSubTitle}</h3>
                        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Sığorta Sinfi' : 'Insurance Class'}</label>
                            <select className="select-field" value={pricingParams.insuranceClass} onChange={e => setPricingParams({ ...pricingParams, insuranceClass: e.target.value })}>
                              <option value="life_survival_m_payments">{lang === 'AZ' ? 'Həyatın yaşam halından sığortası (m dəfə ödənişli)' : 'Pure Endowment (m-payment)'}</option>
                              <option value="life_survival_single_payment">{lang === 'AZ' ? 'Həyatın yaşam sığortası (birdəfəlik)' : 'Pure Endowment (single premium)'}</option>
                              <option value="life_death_single_payment">{lang === 'AZ' ? 'Həyatın ölüm halından sığorta (birdəfəlik)' : 'Term Life Insurance (single premium)'}</option>
                              <option value="life_death_m_payments">{lang === 'AZ' ? 'Həyatın ölüm halından sığorta (m dəfə ödənişli)' : 'Term Life Insurance (m-payment)'}</option>
                              <option value="compulsory">{lang === 'AZ' ? 'İstehsalatda bədbəxt hadisələrdən icbari sığorta' : 'Compulsory Workers\' Compensation'}</option>
                            </select>
                          </div>

                          {pricingParams.insuranceClass === 'compulsory' ? (
                            <>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Doğum tarixi' : 'Birth Date'}</label>
                                <input type="date" className="input-field" value={pricingParams.birthDate} onChange={e => setPricingParams({ ...pricingParams, birthDate: e.target.value })} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Müqavilənin başlama tarixi' : 'Start Date'}</label>
                                <input type="date" className="input-field" value={pricingParams.startDate} onChange={e => setPricingParams({ ...pricingParams, startDate: e.target.value })} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Müqavilənin bitmə tarixi' : 'End Date'}</label>
                                <input type="date" className="input-field" value={pricingParams.endDate} onChange={e => setPricingParams({ ...pricingParams, endDate: e.target.value })} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Uçot dərəcəsi (%)' : 'Discount Rate (%)'}</label>
                                <input type="number" step="0.01" className="input-field" value={globalInterestRate} onChange={e => setGlobalInterestRate(e.target.value)} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Əməkhaqqı' : 'Salary'}</label>
                                <input type="number" className="input-field" value={pricingParams.salary} onChange={e => setPricingParams({ ...pricingParams, salary: e.target.value })} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Hesabat tarixi' : 'Valuation Date'}</label>
                                <input type="date" className="input-field" value={pricingParams.valuationDate} onChange={e => setPricingParams({ ...pricingParams, valuationDate: e.target.value })} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Doğum tarixi' : 'Birth Date'}</label>
                                <input type="date" className="input-field" value={pricingParams.birthDate} onChange={e => setPricingParams({ ...pricingParams, birthDate: e.target.value })} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Müqavilənin başlama tarixi' : 'Start Date'}</label>
                                <input type="date" className="input-field" value={pricingParams.startDate} onChange={e => setPricingParams({ ...pricingParams, startDate: e.target.value })} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Müqavilənin bitmə tarixi' : 'End Date'}</label>
                                <input type="date" className="input-field" value={pricingParams.endDate} onChange={e => setPricingParams({ ...pricingParams, endDate: e.target.value })} />
                              </div>

                              {pricingSubTab === 'premium' && (
                                <div className="form-group">
                                  <label className="form-label">{lang === 'AZ' ? 'Sığorta məbləği' : 'Sum Assured'}</label>
                                  <input type="number" className="input-field" value={pricingParams.sumAssured} onChange={e => setPricingParams({ ...pricingParams, sumAssured: e.target.value })} />
                                </div>
                              )}

                              {pricingSubTab === 'sum_assured' && (
                                <div className="form-group">
                                  <label className="form-label">
                                    {lang === 'AZ' 
                                      ? ((pricingParams.insuranceClass === 'life_survival_m_payments' || pricingParams.insuranceClass === 'life_death_m_payments') ? 'Sığorta haqqı (aylıq)' : 'Sığorta haqqı') 
                                      : ((pricingParams.insuranceClass === 'life_survival_m_payments' || pricingParams.insuranceClass === 'life_death_m_payments') ? 'Premium (monthly)' : 'Premium')
                                    }
                                  </label>
                                  <input type="number" className="input-field" value={pricingParams.premium} onChange={e => setPricingParams({ ...pricingParams, premium: e.target.value })} />
                                </div>
                              )}
                              
                              {(pricingParams.insuranceClass === 'life_death_single_payment' || pricingParams.insuranceClass === 'life_death_m_payments') && (
                                <div className="form-group">
                                  <label className="form-label">{lang === 'AZ' ? 'Kredit Faizi (%)' : 'Credit Interest (%)'}</label>
                                  <input type="number" step="0.1" className="input-field" value={pricingParams.creditApr} onChange={e => setPricingParams({ ...pricingParams, creditApr: e.target.value })} />
                                </div>
                              )}

                              <div className="form-group">
                                <label className="form-label">{t.labelInterest}</label>
                                <input type="number" step="0.01" className="input-field" value={globalInterestRate} onChange={e => setGlobalInterestRate(e.target.value)} />
                              </div>

                              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-color)', marginTop: '0.5rem' }}>
                                <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{lang === 'AZ' ? 'Aktuar Sabitlər' : 'Actuarial Constants'}</h4>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                  <label className="form-label">{lang === 'AZ' ? 'Akvizisiya Xərcləri (alpha) (%)' : 'Acquisition Cost (alpha) (%)'}</label>
                                  <input type="number" step="0.001" className="input-field" value={pricingParams.costAcquisitionInitial || 0} onChange={e => setPricingParams({ ...pricingParams, costAcquisitionInitial: e.target.value })} />
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                  <label className="form-label">{lang === 'AZ' ? 'Dövrü Akvizisiya (betta) (%)' : 'Acquisition Cost (betta) (%)'}</label>
                                  <input type="number" step="0.001" className="input-field" value={pricingParams.costAcquisition} onChange={e => setPricingParams({ ...pricingParams, costAcquisition: e.target.value })} />
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                  <label className="form-label">{lang === 'AZ' ? 'İnzibati Xərclər (gamma) (%)' : 'Maintenance Exp. (gamma) (%)'}</label>
                                  <input type="number" step="0.0001" className="input-field" value={pricingParams.expenseMaintenance} onChange={e => setPricingParams({ ...pricingParams, expenseMaintenance: e.target.value })} />
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                  <label className="form-label">{lang === 'AZ' ? 'Ölüm Marjası (ro1) (%)' : 'Mortality Margin (ro1) (%)'}</label>
                                  <input type="number" step="0.01" className="input-field" value={pricingParams.marginMortality} onChange={e => setPricingParams({ ...pricingParams, marginMortality: e.target.value })} />
                                </div>
                                
                                {(pricingParams.insuranceClass === 'life_survival_m_payments' || pricingParams.insuranceClass === 'life_survival_single_payment') && (
                                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label">{lang === 'AZ' ? 'İnvestisiya Marjası (ro2) (%)' : 'Investment Margin (ro2) (%)'}</label>
                                    <input type="number" step="0.01" className="input-field" value={pricingParams.marginInvestment} onChange={e => setPricingParams({ ...pricingParams, marginInvestment: e.target.value })} />
                                  </div>
                                )}
                                {(pricingParams.insuranceClass !== 'life_death_single_payment' && pricingParams.insuranceClass !== 'life_survival_single_payment') && (
                                  <div className="form-group" style={{ marginBottom: '0' }}>
                                    <label className="form-label">{lang === 'AZ' ? 'Ödəniş Tezliyi (payment_frequency)' : 'Payment Frequency'}</label>
                                    <input type="number" className="input-field" value={pricingParams.paymentFrequency} onChange={e => setPricingParams({ ...pricingParams, paymentFrequency: e.target.value })} />
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={calculatePricing}>
                          {t.btnCalculate}
                        </button>
                      </div>

                      {/* Outputs */}
                      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>{t.pricingOutputTitle}</h3>
                          {pricingResult ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                              {pricingSubTab === 'premium' ? (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                      {lang === 'AZ' ? 'Hesablanmış Sığorta Haqqı:' : 'Calculated Premium:'}
                                    </span>
                                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-tertiary)' }}>{pricingResult.monthlyPremium} AZN</strong>
                                  </div>
                                </>
                              ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>{lang === 'AZ' ? 'Hesablanmış Sığorta Məbləği:' : 'Calculated Sum Assured:'}</span>
                                  <strong style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>{pricingResult.calculatedSumAssured} AZN</strong>
                                </div>
                              )}

                              <div style={{ marginTop: '1rem' }}>
                                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t.commutationLabel}</h4>
                                <div className="commutation-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: '0.5rem' }}>
                                  <div className="commutation-box" style={{ padding: '0.5rem' }}>
                                    <div className="comm-label">Dx</div>
                                    <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.Dx}</div>
                                  </div>
                                  <div className="commutation-box" style={{ padding: '0.5rem' }}>
                                    <div className="comm-label">Nx</div>
                                    <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.Nx}</div>
                                  </div>
                                  <div className="commutation-box" style={{ padding: '0.5rem' }}>
                                    <div className="comm-label">Cx</div>
                                    <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.Cx}</div>
                                  </div>
                                  <div className="commutation-box" style={{ padding: '0.5rem' }}>
                                    <div className="comm-label">Mx</div>
                                    <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.Mx}</div>
                                  </div>
                                  {pricingResult.commutations.Axn !== undefined && (
                                    <>
                                      <div className="commutation-box" style={{ padding: '0.5rem' }} title="A^1_x:n">
                                        <div className="comm-label">A<sub>x:n</sub><sup>1</sup></div>
                                        <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.Axn.toFixed(6)}</div>
                                      </div>
                                      <div className="commutation-box" style={{ padding: '0.5rem' }} title="ä_x:n">
                                        <div className="comm-label">ä<sub>x:n</sub></div>
                                        <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.axn.toFixed(6)}</div>
                                      </div>
                                      <div className="commutation-box" style={{ padding: '0.5rem' }} title="nEx">
                                        <div className="comm-label"><sub>n</sub>E<sub>x</sub></div>
                                        <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.Exn.toFixed(6)}</div>
                                      </div>
                                      <div className="commutation-box" style={{ padding: '0.5rem' }} title="ä^(m)_x:n">
                                        <div className="comm-label">ä<sub>x:n</sub><sup>(m)</sup></div>
                                        <div className="comm-value" style={{ fontSize: '0.85rem' }}>{pricingResult.commutations.axm.toFixed(6)}</div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                              {t.pricingPrompt}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-TAB: RESERVE ENGINE */}
                {softwareTab === 'reserve' && (
                  <div>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.reserveTitle}</h2>
                    <div className="responsive-grid-1-5">
                      <div className="glass-card" style={{ height: 'fit-content' }}>
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>{t.reserveScenario}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          <div className="form-group" style={{ display: 'none' }}>
                            <label className="form-label">{t.labelPolicyId}</label>
                            <input type="text" className="input-field" value={reserveParams.policyId} onChange={e => setReserveParams({ ...reserveParams, policyId: e.target.value })} />
                          </div>
                          
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Sığorta Sinfi' : 'Insurance Class'}</label>
                            <select className="input-field" value={reserveParams.policyType} onChange={e => setReserveParams({ ...reserveParams, policyType: e.target.value })}>
                              <option value="life_survival_m_payments">{lang === 'AZ' ? 'Həyatın yaşam halından sığortası (m dəfə ödənişli)' : 'Pure Endowment (m-payment)'}</option>
                              <option value="life_survival_single_payment">{lang === 'AZ' ? 'Həyatın yaşam sığortası (birdəfəlik)' : 'Pure Endowment (single premium)'}</option>
                              <option value="life_death_single_payment">{lang === 'AZ' ? 'Həyatın ölüm halından sığorta (birdəfəlik)' : 'Term Life Insurance (single premium)'}</option>
                              <option value="life_death_m_payments">{lang === 'AZ' ? 'Həyatın ölüm halından sığorta (m dəfə ödənişli)' : 'Term Life Insurance (m-payment)'}</option>
                            </select>
                          </div>

                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Hesabat tarixi' : 'Valuation Date'}</label>
                            <input type="date" className="input-field" value={reserveParams.valuationDate} onChange={e => setReserveParams({ ...reserveParams, valuationDate: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Doğum tarixi' : 'Birth Date'}</label>
                            <input type="date" className="input-field" value={reserveParams.birthDate} onChange={e => setReserveParams({ ...reserveParams, birthDate: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Müqavilənin başlama tarixi' : 'Start Date'}</label>
                            <input type="date" className="input-field" value={reserveParams.startDate} onChange={e => setReserveParams({ ...reserveParams, startDate: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Müqavilənin bitmə tarixi' : 'End Date'}</label>
                            <input type="date" className="input-field" value={reserveParams.endDate} onChange={e => setReserveParams({ ...reserveParams, endDate: e.target.value })} />
                          </div>

                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Sığorta məbləği' : 'Sum Assured'}</label>
                            <input type="number" className="input-field" value={reserveParams.sumAssured} onChange={e => setReserveParams({ ...reserveParams, sumAssured: e.target.value })} />
                          </div>
                          <div className="form-group">
                             <label className="form-label">
                               {lang === 'AZ' 
                                 ? ((reserveParams.policyType === 'life_survival_m_payments' || reserveParams.policyType === 'life_death_m_payments') ? 'Sığorta haqqı (aylıq)' : 'Sığorta haqqı') 
                                 : ((reserveParams.policyType === 'life_survival_m_payments' || reserveParams.policyType === 'life_death_m_payments') ? 'Premium (monthly)' : 'Premium')
                               }
                             </label>
                             <input type="number" className="input-field" value={reserveParams.premium} onChange={e => setReserveParams({ ...reserveParams, premium: e.target.value })} />
                           </div>
                          
                          { (reserveParams.policyType === 'life_death_single_payment' || reserveParams.policyType === 'life_death_m_payments') && (
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Kredit Faizi (%)' : 'Credit Interest (%)'}</label>
                            <input type="number" step="0.1" className="input-field" value={reserveParams.creditApr} onChange={e => setReserveParams({ ...reserveParams, creditApr: e.target.value })} />
                          </div>
                          )}

                          <div className="form-group">
                            <label className="form-label">{t.labelInterest}</label>
                            <input type="number" step="0.01" className="input-field" value={globalInterestRate} onChange={e => setGlobalInterestRate(e.target.value)} />
                          </div>

                          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-color)', marginTop: '0.5rem' }}>
                            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{lang === 'AZ' ? 'Aktuar Sabitlər' : 'Actuarial Constants'}</h4>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label className="form-label">{lang === 'AZ' ? 'Akvizisiya Xərcləri (alpha) (%)' : 'Acquisition Cost (alpha) (%)'}</label>
                              <input type="number" step="0.001" className="input-field" value={reserveParams.costAcquisitionInitial || 0} onChange={e => setReserveParams({ ...reserveParams, costAcquisitionInitial: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label className="form-label">{lang === 'AZ' ? 'Dövrü Akvizisiya (betta) (%)' : 'Acquisition Cost (betta) (%)'}</label>
                              <input type="number" step="0.001" className="input-field" value={reserveParams.costAcquisition} onChange={e => setReserveParams({ ...reserveParams, costAcquisition: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label className="form-label">{lang === 'AZ' ? 'İnzibati Xərclər (gamma) (%)' : 'Maintenance Exp. (gamma) (%)'}</label>
                              <input type="number" step="0.0001" className="input-field" value={reserveParams.expenseMaintenance} onChange={e => setReserveParams({ ...reserveParams, expenseMaintenance: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label className="form-label">{lang === 'AZ' ? 'Ölüm Marjası (ro1) (%)' : 'Mortality Margin (ro1) (%)'}</label>
                              <input type="number" step="0.01" className="input-field" value={reserveParams.marginMortality} onChange={e => setReserveParams({ ...reserveParams, marginMortality: e.target.value })} />
                            </div>
                            
                            {(reserveParams.policyType === 'life_survival_m_payments' || reserveParams.policyType === 'life_survival_single_payment') && (
                              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label">{lang === 'AZ' ? 'İnvestisiya Marjası (ro2) (%)' : 'Investment Margin (ro2) (%)'}</label>
                                <input type="number" step="0.01" className="input-field" value={reserveParams.marginInvestment} onChange={e => setReserveParams({ ...reserveParams, marginInvestment: e.target.value })} />
                              </div>
                            )}
                            {(reserveParams.policyType !== 'life_death_single_payment' && reserveParams.policyType !== 'life_survival_single_payment') && (
                              <div className="form-group" style={{ marginBottom: '0' }}>
                                <label className="form-label">{lang === 'AZ' ? 'Ödəniş Tezliyi (payment_frequency)' : 'Payment Frequency'}</label>
                                <input type="number" className="input-field" value={reserveParams.paymentFrequency} onChange={e => setReserveParams({ ...reserveParams, paymentFrequency: e.target.value })} />
                              </div>
                            )}
                          </div>
                          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={calculateReserve} disabled={isCalculating}>
                            {isCalculating ? (lang === 'AZ' ? 'Hesablanır...' : 'Calculating...') : t.btnCalculateReserve}
                          </button>
                        </div>
                      </div>

                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>{t.reserveOutputTitle}</h3>
                        {reserveResult ? (
                          <div>
                            <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
                              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{lang === 'AZ' ? 'Aktuar Mühərrik Göstəriciləri' : 'Actuarial Engine Metrics'}</h4>
                              {reserveResult.engineData ? (
                              <div className="commutation-grid">
                                <div className="commutation-box" title={lang === 'AZ' ? 'Tam Yaş (İllik)' : 'Complete Age (Years)'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'Tam Yaş' : 'Age (years)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.age_years}</div>
                                </div>
                                <div className="commutation-box" title={lang === 'AZ' ? 'Yaş (Aylıq)' : 'Age (Monthly)'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'Yaş (ay)' : 'Age (months)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.age_months}</div>
                                </div>
                                <div className="commutation-box" title={lang === 'AZ' ? 'Aylıq Ölüm Ehtimalı' : 'Monthly Mortality Probability'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'qx (ay)' : 'qx (month)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.qx_monthly}</div>
                                </div>
                                <div className="commutation-box" title={lang === 'AZ' ? 'İllik Ölüm Ehtimalı' : 'Annual Mortality Probability'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'qx (il)' : 'qx (year)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.qx_annual}</div>
                                </div>
                                {reserveResult.engineData.Axn !== undefined && (
                                  <div className="commutation-box" title="Ax:n">
                                    <div className="comm-label">Ax:n</div>
                                    <div className="comm-value">{reserveResult.engineData.Axn}</div>
                                  </div>
                                )}
                                {reserveResult.engineData.nEx !== undefined && (
                                  <div className="commutation-box" title="nEx">
                                    <div className="comm-label">nEx</div>
                                    <div className="comm-value">{reserveResult.engineData.nEx}</div>
                                  </div>
                                )}
                                {reserveResult.engineData.axn !== undefined && (
                                  <div className="commutation-box" title="ax:n">
                                    <div className="comm-label">ax:n</div>
                                    <div className="comm-value">{reserveResult.engineData.axn}</div>
                                  </div>
                                )}
                                <div className="commutation-box" title={lang === 'AZ' ? 'Sığorta ödənişləri' : 'Liability Benefits'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'SÖ (Sığorta ödənişləri)' : 'LB (Liability Benefits)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.liability_benefits}</div>
                                </div>
                                <div className="commutation-box" title={lang === 'AZ' ? 'Zərərlərin tənzimləmə xərcləri' : 'Loss Adjustment Expenses'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'ZTX (Zərərlərin tənzimləmə x. )' : 'LAE (Loss Adjustment Expenses)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.liability_risk_margin}</div>
                                </div>
                                <div className="commutation-box" title={lang === 'AZ' ? 'İnzibati və Administrativ xərclər' : 'Administrative Expenses'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'İAX (İnzibati və Adm. x. )' : 'AE (Administrative Expenses)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.liability_expenses}</div>
                                </div>
                                <div className="commutation-box" title={lang === 'AZ' ? 'Sığorta haqları' : 'Asset Premiums'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'SH (Sığorta haqları)' : 'AP (Asset Premiums)'}</div>
                                  <div className="comm-value">{reserveResult.engineData.asset_premiums}</div>
                                </div>
                                {reserveResult.engineData.active_sum_insured !== undefined && (
                                  <div className="commutation-box" title={lang === 'AZ' ? 'Sığorta məbləği' : 'Sum Assured'}>
                                    <div className="comm-label">{lang === 'AZ' ? 'S (Sığorta məbləği)' : 'S (Sum Assured)'}</div>
                                    <div className="comm-value">{reserveResult.engineData.active_sum_insured}</div>
                                  </div>
                                )}
                                <div className="commutation-box" style={{ gridColumn: 'span 2', background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)' }} title={lang === 'AZ' ? 'Uzunmüddətli öhdəliklər ehtiyatı (Riyazi ehtiyat)' : 'Reserve for Long-Term Liabilities (Mathematical Reserve)'}>
                                  <div className="comm-label">{lang === 'AZ' ? 'Uzunmüddətli öhdəliklər ehtiyatı (Riyazi ehtiyat)' : 'Reserve for Long-Term Liabilities (Mathematical Reserve)'}</div>
                                  <div className="comm-value" style={{ color: 'var(--color-primary)' }}>{reserveResult.engineData.final_reserve || reserveResult.engineData.net_mathematical_reserve}</div>
                                </div>
                              </div>
                              ) : (
                                <div style={{ color: 'var(--text-muted)' }}>{lang === 'AZ' ? 'Məlumat yoxdur' : 'No data available'}</div>
                              )}
                            </div>


                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                            {t.reservePrompt}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-TAB: PORTFOLIO */}
                {softwareTab === 'portfolio' && (
                  <div>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.portfolioDashboard}</h2>
                    <div className="responsive-grid-2" style={{ marginBottom: '2rem' }}>
                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>{t.productDist}</h3>
                        <div className="mock-chart-container" style={{ justifyContent: 'space-around', alignItems: 'flex-end', height: '240px' }}>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%', background: 'var(--color-primary)' }}></div>
                            <div className="chart-label">Term Life</div>
                          </div>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%', background: 'var(--color-secondary)' }}></div>
                            <div className="chart-label">Endowment</div>
                          </div>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%', background: 'var(--color-tertiary)' }}></div>
                            <div className="chart-label">Annuity</div>
                          </div>
                        </div>
                      </div>

                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>{t.ageDist}</h3>
                        <div className="mock-chart-container" style={{ height: '240px' }}>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%' }}></div>
                            <div className="chart-label">18-25</div>
                          </div>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%' }}></div>
                            <div className="chart-label">26-35</div>
                          </div>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%' }}></div>
                            <div className="chart-label">36-45</div>
                          </div>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%' }}></div>
                            <div className="chart-label">46-55</div>
                          </div>
                          <div className="chart-bar-wrapper">
                            <div className="chart-value">0</div>
                            <div className="chart-bar" style={{ height: '10%' }}></div>
                            <div className="chart-label">56+</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-TAB: POLICY EXPLORER */}
                {softwareTab === 'policy-explorer' && (
                  <div>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.policyExplorer}</h2>
                    <div className="glass-card" style={{ marginBottom: '2rem' }}>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <input type="text" className="input-field" placeholder={t.searchPlaceholder} value={searchPolicyId} onChange={e => setSearchPolicyId(e.target.value)} />
                        <button className="btn-primary" onClick={searchPolicy}>{t.searchBtn}</button>
                      </div>
                    </div>

                    {searchedPolicy ? (
                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>{t.policyDetailsTitle}</h3>
                        <div className="responsive-grid-2" style={{ gap: '1.5rem', fontSize: '0.95rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div><span style={{ color: 'var(--text-secondary)' }}>{t.customerName}</span> <strong>{searchedPolicy.name}</strong></div>
                            <div><span style={{ color: 'var(--text-secondary)' }}>{t.policyIdCert}</span> <strong>{searchedPolicy.id} / {searchedPolicy.cert}</strong></div>
                            <div><span style={{ color: 'var(--text-secondary)' }}>{lang==='AZ'?'Məhsul:':'Product:'}</span> <strong>{searchedPolicy.product}</strong></div>
                            <div><span style={{ color: 'var(--text-secondary)' }}>{t.genderAge}</span> <strong>{searchedPolicy.gender} / {searchedPolicy.age} {lang==='AZ'?'yaş':'years'}</strong></div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div><span style={{ color: 'var(--text-secondary)' }}>{t.annualPremium}</span> <strong style={{ color: 'var(--color-primary)' }}>{searchedPolicy.premium} AZN</strong></div>
                            <div><span style={{ color: 'var(--text-secondary)' }}>{t.reserveVal}</span> <strong style={{ color: 'var(--color-secondary)' }}>{searchedPolicy.reserve} AZN</strong></div>
                            <div><span style={{ color: 'var(--text-secondary)' }}>{t.policyStatus}</span> <span className="badge badge-success">{searchedPolicy.status}</span></div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                          <button className="btn-secondary" onClick={() => {
                            setPricingParams({ ...pricingParams, age: searchedPolicy.age, gender: searchedPolicy.gender, product: searchedPolicy.product });
                            setSoftwareTab('pricing');
                            alert(lang==='AZ'?"Müqavilə parametrləri yükləndi.":"Policy parameters loaded.");
                          }}>
                            {t.loadParamsPricing}
                          </button>
                          <button className="btn-secondary" onClick={() => {
                            setReserveParams({ ...reserveParams, policyId: searchedPolicy.id });
                            setSoftwareTab('reserve');
                            alert(lang==='AZ'?"Müqavilə parametrləri yükləndi.":"Policy parameters loaded.");
                          }}>
                            {t.loadParamsReserve}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                        {t.policyNotFound}
                      </div>
                    )}
                  </div>
                )}

                 {/* SUB-TAB: FORMULA EXPLORER */}
                 {softwareTab === 'formula-explorer' && (
                   <div>
                     <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.formulaExplorer}</h2>
                     
                     {/* Category tabs */}
                     <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
                       <button className={`btn-secondary ${formulaCategory === 'mortality' ? 'active' : ''}`} style={formulaCategory === 'mortality' ? { background: 'rgba(99, 102, 241, 0.15)', borderColor: 'var(--color-primary)' } : {}} onClick={() => setFormulaCategory('mortality')}>
                         {lang === 'AZ' ? "Ölüm Cədvəli" : "Mortality Table"}
                       </button>
                     </div>

                     <div className="glass-card" style={{ padding: '2rem' }}>

                       {/* CATEGORY: MORTALITY TABLE */}
                       {formulaCategory === 'mortality' && (
                         <div style={{ height: '700px', display: 'flex', flexDirection: 'column' }}>
                           <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--color-primary)' }}>
                             {lang === 'AZ' ? 'Aylıq Ölüm Cədvəli və Kommutasiya Ədədləri (1272 Ay)' : 'Monthly Mortality Table & Commutation (1272 Months)'}
                           </h3>
                           <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                             <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{lang === 'AZ' ? 'Texniki Faiz Dərəcəsi (%):' : 'Technical Interest Rate (%):'}</label>
                             <input type="number" step="0.01" value={globalInterestRate} onChange={e => setGlobalInterestRate(e.target.value)} className="form-input" style={{ width: '100px', padding: '0.4rem', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }} />
                           </div>
                           <div style={{ overflowY: 'auto', flexGrow: 1, paddingRight: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                               <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-glass)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border-color)', zIndex: 10 }}>
                                 <tr>
                                   <th style={{ padding: '0.75rem', textAlign: 'center' }}>Ay</th>
                                   <th style={{ padding: '0.75rem', textAlign: 'center' }}>X (Yaş)</th>
                                   <th style={{ padding: '0.75rem' }}>l(x)</th>
                                   <th style={{ padding: '0.75rem' }}>d(x)</th>
                                   <th style={{ padding: '0.75rem' }}>q(x) (%)</th>
                                   <th style={{ padding: '0.75rem' }}>p(x) (%)</th>
                                   <th style={{ padding: '0.75rem' }}>D(x)</th>
                                   <th style={{ padding: '0.75rem' }}>C(x)</th>
                                   <th style={{ padding: '0.75rem' }}>N(x)</th>
                                   <th style={{ padding: '0.75rem' }}>M(x)</th>
                                 </tr>
                               </thead>
                               <tbody>
                                 {mortalityTable.map((row, i) => (
                                   <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                     <td style={{ padding: '0.5rem', textAlign: 'center' }}>{row.month}</td>
                                     <td style={{ padding: '0.5rem', textAlign: 'center' }}>{row.x}</td>
                                     <td style={{ padding: '0.5rem' }}>{row.lx?.toFixed(2)}</td>
                                     <td style={{ padding: '0.5rem' }}>{row.dx?.toFixed(6)}</td>
                                     <td style={{ padding: '0.5rem' }}>{(row.qx * 100)?.toFixed(10)}%</td>
                                     <td style={{ padding: '0.5rem' }}>{(row.px * 100)?.toFixed(10)}%</td>
                                     <td style={{ padding: '0.5rem' }}>{row.Dx?.toFixed(2)}</td>
                                     <td style={{ padding: '0.5rem' }}>{row.Cx?.toFixed(4)}</td>
                                     <td style={{ padding: '0.5rem' }}>{row.Nx?.toFixed(2)}</td>
                                     <td style={{ padding: '0.5rem' }}>{row.Mx?.toFixed(4)}</td>
                                   </tr>
                                 ))}
                               </tbody>
                             </table>
                           </div>
                         </div>
                       )}
                     </div>
                   </div>
                 )}

                {/* SUB-TAB: OFFICIAL DOCS */}
                {softwareTab === 'official-docs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.officialDocs}</h2>
                    
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                      <button 
                        className={`tab-btn ${officialDoc === 'telimat' ? 'active' : ''}`}
                        style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', color: officialDoc === 'telimat' ? 'var(--color-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: officialDoc === 'telimat' ? '2px solid var(--color-primary)' : 'none', fontWeight: officialDoc === 'telimat' ? 'bold' : 'normal' }}
                        onClick={() => setOfficialDoc('telimat')}
                      >
                        Aktuar Hesablamalar Təlimatı
                      </button>
                      <button 
                        className={`tab-btn ${officialDoc === 'qaydalar' ? 'active' : ''}`}
                        style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', color: officialDoc === 'qaydalar' ? 'var(--color-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: officialDoc === 'qaydalar' ? '2px solid var(--color-primary)' : 'none', fontWeight: officialDoc === 'qaydalar' ? 'bold' : 'normal' }}
                        onClick={() => setOfficialDoc('qaydalar')}
                      >
                        Sığorta Ehtiyatları Qaydası
                      </button>
                    </div>

                    <div className="glass-card" style={{ flexGrow: 1, padding: 0, overflow: 'hidden', height: '80vh' }}>
                      <iframe 
                        src={officialDoc === 'telimat' ? "/assets/aktuar_telimat.pdf" : "/assets/ehtiyat_qaydalari.pdf"} 
                        title="Rəsmi sənəd" 
                        width="100%" 
                        height="100%" 
                        style={{ border: 'none' }}
                      />
                    </div>
                  </div>
                )}
              </main>
            </div>
          )}

          {/* DEDICATED FEEDBACK PAGE */}
          {activeTab === 'feedback' && (
            <div style={{ padding: '4rem 5%', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', width: '100%' }}>
              <div className="glass-card" style={{ width: '100%', maxWidth: '600px', padding: '2.5rem', background: 'rgba(18, 18, 37, 0.8)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--shadow-premium)' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                  <span style={{ fontSize: '3rem' }}>💬</span>
                  <h2 className="text-gradient" style={{ fontSize: '2rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
                    {lang === 'AZ' ? 'Bizə rəy bildirin' : 'Give us feedback'}
                  </h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    {lang === 'AZ' ? 'Platformamızı təkmilləşdirməyimizə kömək edin.' : 'Help us improve our platform by sharing your thoughts.'}
                  </p>
                </div>

                <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="feedback-email" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: '500' }}>
                      {lang === 'AZ' ? 'E-mail ünvanınız (real və məcburi)' : 'Your email address (real and required)'}
                    </label>
                    <input 
                      id="feedback-email"
                      type="email" 
                      className="input-field" 
                      placeholder="example@mail.com" 
                      value={feedbackEmail} 
                      onChange={e => setFeedbackEmail(e.target.value)} 
                      required 
                      style={{ padding: '0.8rem 1rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="feedback-text" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: '500' }}>
                      {lang === 'AZ' ? 'Rəyiniz (məcburi)' : 'Your feedback (required)'}
                    </label>
                    <textarea 
                      id="feedback-text"
                      className="input-field" 
                      rows="6" 
                      placeholder={lang === 'AZ' ? 'Fikir və təkliflərinizi bura yazın...' : 'Enter your thoughts and suggestions here...'} 
                      value={feedbackText} 
                      onChange={e => setFeedbackText(e.target.value)} 
                      style={{ resize: 'vertical', fontFamily: 'inherit', padding: '0.8rem 1rem' }}
                      required 
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                    {feedbackStatus === 'loading' && (
                      <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
                        {lang === 'AZ' ? 'Göndərilir...' : 'Sending...'}
                      </span>
                    )}
                    {feedbackStatus === 'success' && (
                      <span style={{ fontSize: '0.95rem', color: 'var(--color-success)', fontWeight: '500' }}>
                        {lang === 'AZ' ? 'Rəyiniz uğurla göndərildi!' : 'Feedback sent successfully!'}
                      </span>
                    )}
                    {feedbackStatus === 'error' && (
                      <span style={{ fontSize: '0.95rem', color: 'var(--color-danger)', fontWeight: '500' }}>
                        {feedbackStatusMsg || (lang === 'AZ' ? 'Xəta baş verdi!' : 'An error occurred!')}
                      </span>
                    )}
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      disabled={feedbackStatus === 'loading'}
                      style={{ padding: '0.8rem 2.5rem', fontSize: '1rem', borderRadius: '8px' }}
                    >
                      {lang === 'AZ' ? 'Göndər' : 'Submit'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </React.Fragment>
      );
    }





    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
