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
    

    // --- TRANSLATIONS DICTIONARY (Bilingual support AZ / EN) ---

    function App() {
      const [lang, setLang] = useState('AZ');
      const [activeTab, setActiveTab] = useState('home');
      const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
      const [selectedCv, setSelectedCv] = useState(null);
      const [selectedArticle, setSelectedArticle] = useState(null);
      const [softwareTab, setSoftwareTab] = useState('pricing');
      const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
      const [articleText, setArticleText] = useState('');
      const [loadingArticle, setLoadingArticle] = useState(false);
      const [formulaCategory, setFormulaCategory] = useState('mortality');

      const t = translations[lang];

      // App calculations state
      const [importedState, setImportedState] = useState({
        status: 'idle', 
        policyCount: 0,
        errors: 0,
        warnings: 0,
        fileName: ''
      });

      const [pricingParams, setPricingParams] = useState({
        insuranceClass: 'life_endowment',
        birthDate: '',
        startDate: '',
        endDate: '',
        sumAssured: '',
        premium: '',
        discountRate: 5.0,
        creditInterest: 10.0,
        salary: ''
      });

      const [pricingResult, setPricingResult] = useState(null);

      const [reserveParams, setReserveParams] = useState({
        policyId: 'POL-2401',
        valuationDate: '2026-01-01',
        birthDate: '1996-01-01',
        startDate: '2025-01-01',
        endDate: '2045-01-01',
        sumAssured: 100000,
        premium: 500,
        creditApr: 10,
        policyType: 'life_endowment',
        interest: 5.0,
        expenseMaintenance: 0.0025,
        marginMortality: 0.03,
        marginInvestment: 0.015,
        costAcquisitionInitial: 0.0,
        costAcquisition: 0.003,
        paymentFrequency: 12
      });

      const [reserveResult, setReserveResult] = useState(null);

      const [mortalityTable, setMortalityTable] = useState([]);
      const [globalInterestRate, setGlobalInterestRate] = useState("5.0");

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

      // --- ALL MATHEMATICAL CALCULATIONS CLEANED TO ZERO AS REQUESTED ---
      const calculatePricing = () => {
        setPricingResult({
          commutations: { Dx: 0, Nx: 0, Cx: 0, Mx: 0 },
          netPremium: 0,
          grossPremium: 0,
          monthlyPremium: 0
        });
      };

      const calculateReserve = async () => {
        try {
          const payload = {
            params: {
              valuation_date: reserveParams.valuationDate,
              interest_rate_annual: parseFloat(globalInterestRate) / 100 || 0,
              expense_maintenance: parseFloat(reserveParams.expenseMaintenance) || 0.0025,
              margin_mortality: parseFloat(reserveParams.marginMortality) || 0.03,
              margin_investment: parseFloat(reserveParams.marginInvestment) || 0.0,
              cost_acquisition_initial: parseFloat(reserveParams.costAcquisitionInitial) || 0.0,
              cost_acquisition: parseFloat(reserveParams.costAcquisition) || 0.01,
              payment_frequency: reserveParams.policyType === 'credit' ? 1 : (parseInt(reserveParams.paymentFrequency) || 12)
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

          // Render URL
          const API_BASE_URL = 'https://actuary-it-com.onrender.com';
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

      const openArticle = async (article, index) => {
        setSelectedArticle(article);
        setLoadingArticle(true);
        setArticleText('');
        try {
          const response = await fetch(`./blog/blog_${index + 1}_${lang.toLowerCase()}.txt`);
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

              {/* Stats & Features */}
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', width: '100%', maxWidth: '1100px' }}>
                <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚡</div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{lang === 'AZ' ? 'Yüksək Sürət' : 'High Speed'}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    {lang === 'AZ' ? 'Milyonlarla sətri əhatə edən böyük verilənləri (Big Data) asanlıqla emal edən güclü arxitektura.' : 'Powerful architecture that easily processes Big Data spanning millions of rows.'}
                  </p>
                </div>
                <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{lang === 'AZ' ? 'Dəqiqlik və Güvən' : 'Accuracy & Trust'}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    {lang === 'AZ' ? 'Stoxastik və deterministik modellərlə maksimum dəqiqliyi təmin edən hesablama alqoritmləri.' : 'Calculation algorithms ensuring maximum accuracy with stochastic and deterministic models.'}
                  </p>
                </div>
                <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{lang === 'AZ' ? 'Avtomatik Hesabatlıq' : 'Automated Reporting'}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    {lang === 'AZ' ? 'IFRS 17 və digər yerli standartlara uyğun tək kliklə rəsmi sənəd generasiyası.' : 'One-click official document generation compliant with IFRS 17 and other local standards.'}
                  </p>
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
                {blogArticles.map((article, idx) => (
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
                <div className="sidebar-heading">{sidebarOpen ? t.sidebarPanels : '...'}</div>
                <button className={`sidebar-btn ${softwareTab === 'dashboard' ? 'active' : ''}`} onClick={() => setSoftwareTab('dashboard')}>
                  <IconDashboard /> <span className="sidebar-btn-text">{t.dashboard}</span>
                </button>
                <button className={`sidebar-btn ${softwareTab === 'import-data' ? 'active' : ''}`} onClick={() => setSoftwareTab('import-data')}>
                  <IconUpload /> <span className="sidebar-btn-text">{t.importData}</span>
                </button>
                <div className="sidebar-heading">{sidebarOpen ? t.sidebarEngines : '...'}</div>
                <button className={`sidebar-btn ${softwareTab === 'pricing' ? 'active' : ''}`} onClick={() => setSoftwareTab('pricing')}>
                  <IconDollar /> <span className="sidebar-btn-text">{t.pricingEngine}</span>
                </button>
                <button className={`sidebar-btn ${softwareTab === 'reserve' ? 'active' : ''}`} onClick={() => setSoftwareTab('reserve')}>
                  <IconTrendingUp /> <span className="sidebar-btn-text">{t.reserveEngine}</span>
                </button>
                <button className={`sidebar-btn ${softwareTab === 'portfolio' ? 'active' : ''}`} onClick={() => setSoftwareTab('portfolio')}>
                  <IconFolder /> <span className="sidebar-btn-text">{t.portfolioDashboard}</span>
                </button>
                <div className="sidebar-heading">{sidebarOpen ? t.sidebarAnalytics : '...'}</div>
                <button className={`sidebar-btn ${softwareTab === 'policy-explorer' ? 'active' : ''}`} onClick={() => setSoftwareTab('policy-explorer')}>
                  <IconSearch /> <span className="sidebar-btn-text">{t.policyExplorer}</span>
                </button>
                <button className={`sidebar-btn ${softwareTab === 'formula-explorer' ? 'active' : ''}`} onClick={() => setSoftwareTab('formula-explorer')}>
                  <IconCalculator /> <span className="sidebar-btn-text">{t.formulaExplorer}</span>
                </button>
                <button className={`sidebar-btn ${softwareTab === 'reports' ? 'active' : ''}`} onClick={() => setSoftwareTab('reports')}>
                  <IconFileText /> <span className="sidebar-btn-text">{t.reports}</span>
                </button>
              </aside>

              {/* MAIN SOFTWARE WORKSPACE */}
              <main className="software-content">
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
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.pricingTitle}</h2>
                    <div className="responsive-grid-2">
                      {/* Inputs */}
                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>{t.pricingSubTitle}</h3>
                        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Sığorta Sinifi' : 'Insurance Class'}</label>
                            <select className="select-field" value={pricingParams.insuranceClass} onChange={e => setPricingParams({ ...pricingParams, insuranceClass: e.target.value })}>
                              <option value="life_endowment">{lang === 'AZ' ? 'Həyatın yığım sığortası' : 'Endowment Life Insurance'}</option>
                              <option value="credit">{lang === 'AZ' ? 'Kredit sığortası - Həyatın ölüm halında' : 'Credit Life Insurance - Death Only'}</option>
                              <option value="mortgage">{lang === 'AZ' ? 'İpoteka sığortası - Həyatın ölüm halında' : 'Mortgage Life Insurance - Death Only'}</option>
                              <option value="compulsory">{lang === 'AZ' ? 'İstehsalatda bədbəxt hadisələrdən icbari sığorta' : 'Compulsory Workers\' Compensation'}</option>
                            </select>
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
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Uçot dərəcəsi (%)' : 'Discount Rate (%)'}</label>
                            <input type="number" step="0.01" className="input-field" value={globalInterestRate} onChange={e => setGlobalInterestRate(e.target.value)} />
                          </div>
                          
                          {pricingParams.insuranceClass === 'life_endowment' && (
                            <div className="form-group">
                              <label className="form-label">{lang === 'AZ' ? 'Sığorta haqqı' : 'Premium'}</label>
                              <input type="number" className="input-field" value={pricingParams.premium} onChange={e => setPricingParams({ ...pricingParams, premium: parseFloat(e.target.value) || 0 })} />
                            </div>
                          )}

                          {(pricingParams.insuranceClass === 'credit' || pricingParams.insuranceClass === 'mortgage') && (
                            <>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Sığorta məbləği' : 'Sum Assured'}</label>
                                <input type="number" className="input-field" value={pricingParams.sumAssured} onChange={e => setPricingParams({ ...pricingParams, sumAssured: parseFloat(e.target.value) || 0 })} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">{lang === 'AZ' ? 'Kredit Faizi (%)' : 'Credit Interest (%)'}</label>
                                <input type="number" step="0.1" className="input-field" value={pricingParams.creditInterest} onChange={e => setPricingParams({ ...pricingParams, creditInterest: parseFloat(e.target.value) || 0 })} />
                              </div>
                            </>
                          )}

                          {pricingParams.insuranceClass === 'compulsory' && (
                            <div className="form-group">
                              <label className="form-label">{lang === 'AZ' ? 'Əməkhaqqı' : 'Salary'}</label>
                              <input type="number" className="input-field" value={pricingParams.salary} onChange={e => setPricingParams({ ...pricingParams, salary: parseFloat(e.target.value) || 0 })} />
                            </div>
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
                              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{t.netPremiumLabel}</span>
                                <strong style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>{pricingResult.netPremium} AZN</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{t.grossPremiumLabel}</span>
                                <strong style={{ fontSize: '1.25rem', color: 'var(--color-secondary)' }}>{pricingResult.grossPremium} AZN</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{t.monthlyPremiumLabel}</span>
                                <strong style={{ fontSize: '1.25rem', color: 'var(--color-tertiary)' }}>{pricingResult.monthlyPremium} AZN</strong>
                              </div>

                              <div style={{ marginTop: '1rem' }}>
                                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t.commutationLabel}</h4>
                                <div className="commutation-grid">
                                  <div className="commutation-box">
                                    <div className="comm-label">Dx</div>
                                    <div className="comm-value">{pricingResult.commutations.Dx}</div>
                                  </div>
                                  <div className="commutation-box">
                                    <div className="comm-label">Nx</div>
                                    <div className="comm-value">{pricingResult.commutations.Nx}</div>
                                  </div>
                                  <div className="commutation-box">
                                    <div className="comm-label">Cx</div>
                                    <div className="comm-value">{pricingResult.commutations.Cx}</div>
                                  </div>
                                  <div className="commutation-box">
                                    <div className="comm-label">Mx</div>
                                    <div className="comm-value">{pricingResult.commutations.Mx}</div>
                                  </div>
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
                              <option value="life_endowment">{lang === 'AZ' ? 'Həyat (Yığım)' : 'Life (Endowment)'}</option>
                              <option value="credit">{lang === 'AZ' ? 'Kredit Həyat' : 'Credit Life'}</option>
                              <option value="mortgage">{lang === 'AZ' ? 'İpoteka Həyat' : 'Mortgage Life'}</option>
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
                            <input type="number" className="input-field" value={reserveParams.sumAssured} onChange={e => setReserveParams({ ...reserveParams, sumAssured: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Sığorta haqqı' : 'Premium'}</label>
                            <input type="number" className="input-field" value={reserveParams.premium} onChange={e => setReserveParams({ ...reserveParams, premium: parseFloat(e.target.value) || 0 })} />
                          </div>
                          
                          { (reserveParams.policyType === 'credit' || reserveParams.policyType === 'mortgage') && (
                          <div className="form-group">
                            <label className="form-label">{lang === 'AZ' ? 'Kredit Faizi (%)' : 'Credit Interest (%)'}</label>
                            <input type="number" step="0.1" className="input-field" value={reserveParams.creditApr} onChange={e => setReserveParams({ ...reserveParams, creditApr: parseFloat(e.target.value) || 0 })} />
                          </div>
                          )}

                          <div className="form-group">
                            <label className="form-label">{t.labelInterest}</label>
                            <input type="number" step="0.01" className="input-field" value={globalInterestRate} onChange={e => setGlobalInterestRate(e.target.value)} />
                          </div>

                          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-color)', marginTop: '0.5rem' }}>
                            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{lang === 'AZ' ? 'Aktuar Sabitlər' : 'Actuarial Constants'}</h4>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label className="form-label">{lang === 'AZ' ? 'Dövrü Akvizisiya (betta)' : 'Acquisition Cost (betta)'}</label>
                              <input type="number" step="0.001" className="input-field" value={reserveParams.costAcquisition} onChange={e => setReserveParams({ ...reserveParams, costAcquisition: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label className="form-label">{lang === 'AZ' ? 'İnzibati Xərclər (gamma)' : 'Maintenance Exp. (gamma)'}</label>
                              <input type="number" step="0.0001" className="input-field" value={reserveParams.expenseMaintenance} onChange={e => setReserveParams({ ...reserveParams, expenseMaintenance: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <label className="form-label">{lang === 'AZ' ? 'Ölüm Marjası (ro1)' : 'Mortality Margin (ro1)'}</label>
                              <input type="number" step="0.01" className="input-field" value={reserveParams.marginMortality} onChange={e => setReserveParams({ ...reserveParams, marginMortality: parseFloat(e.target.value) || 0 })} />
                            </div>
                            
                            {reserveParams.policyType === 'life_endowment' && (
                              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label">{lang === 'AZ' ? 'İnvestisiya Marjası (ro2)' : 'Investment Margin (ro2)'}</label>
                                <input type="number" step="0.01" className="input-field" value={reserveParams.marginInvestment} onChange={e => setReserveParams({ ...reserveParams, marginInvestment: parseFloat(e.target.value) || 0 })} />
                              </div>
                            )}
                            {reserveParams.policyType !== 'credit' && (
                              <div className="form-group" style={{ marginBottom: '0' }}>
                                <label className="form-label">{lang === 'AZ' ? 'Ödəniş Tezliyi (payment_frequency)' : 'Payment Frequency'}</label>
                                <input type="number" className="input-field" value={reserveParams.paymentFrequency} onChange={e => setReserveParams({ ...reserveParams, paymentFrequency: parseInt(e.target.value) || 12 })} />
                              </div>
                            )}
                          </div>
                          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={calculateReserve}>
                            {t.btnCalculateReserve}
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
                                <div className="commutation-box" title="Tam Yaş (İllik)">
                                  <div className="comm-label">Tam Yaş</div>
                                  <div className="comm-value">{reserveResult.engineData.age_years}</div>
                                </div>
                                <div className="commutation-box" title="Yaş (Aylıq)">
                                  <div className="comm-label">Yaş (ay)</div>
                                  <div className="comm-value">{reserveResult.engineData.age_months}</div>
                                </div>
                                <div className="commutation-box" title="Aylıq Ölüm Ehtimalı">
                                  <div className="comm-label">qx (ay)</div>
                                  <div className="comm-value">{reserveResult.engineData.qx_monthly}</div>
                                </div>
                                <div className="commutation-box" title="İllik Ölüm Ehtimalı">
                                  <div className="comm-label">qx (il)</div>
                                  <div className="comm-value">{reserveResult.engineData.qx_annual}</div>
                                </div>
                                <div className="commutation-box" title="Sığorta ödənişləri">
                                  <div className="comm-label">SÖ (Sığorta ödənişləri)</div>
                                  <div className="comm-value">{reserveResult.engineData.liability_benefits}</div>
                                </div>
                                <div className="commutation-box" title="Zərərlərin tənzimləmə xərcləri">
                                  <div className="comm-label">ZTX (Zərərlərin tənzimləmə x. )</div>
                                  <div className="comm-value">{reserveResult.engineData.liability_risk_margin}</div>
                                </div>
                                <div className="commutation-box" title="İnzibati və Administrativ xərclər">
                                  <div className="comm-label">İAX (İnzibati və Adm. x. )</div>
                                  <div className="comm-value">{reserveResult.engineData.liability_expenses}</div>
                                </div>
                                <div className="commutation-box" title="Sığorta haqları">
                                  <div className="comm-label">SH (Sığorta haqları)</div>
                                  <div className="comm-value">{reserveResult.engineData.asset_premiums}</div>
                                </div>
                                <div className="commutation-box" style={{ gridColumn: 'span 2', background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)' }} title="Yekun Reserve">
                                  <div className="comm-label">Reserve</div>
                                  <div className="comm-value" style={{ color: 'var(--color-primary)' }}>{reserveResult.engineData.final_reserve || reserveResult.engineData.net_mathematical_reserve}</div>
                                </div>
                              </div>
                              ) : (
                                <div style={{ color: 'var(--text-muted)' }}>Məlumat yoxdur</div>
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

                {/* SUB-TAB: REPORTS GENERATOR */}
                {softwareTab === 'reports' && (
                  <div>
                    <h2 className="section-title text-gradient-primary" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>{t.reportGeneratorTitle}</h2>
                    <div className="responsive-grid-1-2-1">
                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>{t.reportTypesTitle}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div>
                              <strong style={{ display: 'block' }}>{t.reportType1}</strong>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.reportType1Desc}</span>
                            </div>
                            <button className="btn-primary" onClick={() => generateReportAction('Pricing Report')} disabled={generatingReport !== null}>
                              {generatingReport === 'Pricing Report' ? t.generating : t.btnGeneratePdf}
                            </button>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div>
                              <strong style={{ display: 'block' }}>{t.reportType2}</strong>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.reportType2Desc}</span>
                            </div>
                            <button className="btn-primary" onClick={() => generateReportAction('Reserve Report')} disabled={generatingReport !== null}>
                              {generatingReport === 'Reserve Report' ? t.generating : t.btnGeneratePdf}
                            </button>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ display: 'block' }}>{t.reportType3}</strong>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.reportType3Desc}</span>
                            </div>
                            <button className="btn-primary" onClick={() => generateReportAction('Portfolio Report')} disabled={generatingReport !== null}>
                              {generatingReport === 'Portfolio Report' ? t.generating : t.btnGenerateExcel}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="glass-card">
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>{t.recentReports}</h3>
                        {reportsList.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {reportsList.map((rep, idx) => (
                              <div key={idx} className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.01)' }}>
                                <div>
                                  <strong style={{ fontSize: '0.95rem' }}>{rep.type}</strong>
                                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rep.id} • {rep.date} • {rep.size}</span>
                                </div>
                                <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => alert(`${rep.type} downloaded.`)}>{t.btnDownload}</button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                            {t.noRecentReports}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </main>
            </div>
          )}
        </React.Fragment>
      );
    }





    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
