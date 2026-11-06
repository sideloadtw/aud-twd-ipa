import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  ArrowRightLeft,
  Award,
  TrendingUp,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Sparkles,
  DollarSign,
  Layers,
  ChevronDown,
  ChevronUp,
  Clock
} from 'lucide-react';

export default function App() {
  // 換算方向：'AUD_TO_TWD' (固定澳幣算實拿台幣) | 'TWD_TO_AUD' (指定台幣反推所需澳幣)
  const [mode, setMode] = useState('AUD_TO_TWD');
  const [audInput, setAudInput] = useState(520);
  const [twdInput, setTwdInput] = useState(12000);

  // 即時匯率與手續費狀態
  const [rates, setRates] = useState({
    midAudTwd: 22.8916,
    visaSpreadPct: 0.5, // Visa 組織相較中價微幅匯差 (%)
    csUsdtAud: 1.4409,  // CoinSpot USDT/AUD 報價
    maxUsdtTwd: 33.0283 // MAX USDT/TWD 報價
  });

  // 進階參數設定
  const [maxWithdrawalFee, setMaxWithdrawalFee] = useState(30); // 一般銀行 30 TWD, 遠東 Bankee 0 TWD
  const [maxTradeFeePct, setMaxTradeFeePct] = useState(0.08);   // Maker 0.08%, Taker 0.16%
  const [trc20GasUsdt, setTrc20GasUsdt] = useState(1.0);        // CoinSpot TRC20 提幣費固定 1 USDT

  // 聯網狀態與自動更新控制
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [lastUpdated, setLastUpdated] = useState('尚未同步');
  const [dataSourceLabel, setDataSourceLabel] = useState('預設基準匯率');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 計算實際 Visa 即期匯率
  const visaRate = useMemo(() => {
    return Number((rates.midAudTwd * (1 - rates.visaSpreadPct / 100)).toFixed(4));
  }, [rates.midAudTwd, rates.visaSpreadPct]);

  // 聯網抓取最新匯率與加密貨幣報價
  const fetchLiveQuotes = useCallback(async () => {
    setIsSyncing(true);
    try {
      // 如果在 iOS 原生 WKWebView 容器內且支援原生無 CORS 報價注入
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fetchNativeRates) {
        window.webkit.messageHandlers.fetchNativeRates.postMessage({});
      }

      const [fxRes, cgRes] = await Promise.allSettled([
        fetch('https://open.er-api.com/v6/latest/AUD').then((r) => r.json()),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=aud,twd').then((r) => r.json())
      ]);

      let updatedMid = rates.midAudTwd;
      let updatedCs = rates.csUsdtAud;
      let updatedMax = rates.maxUsdtTwd;
      let sourceParts = [];

      if (fxRes.status === 'fulfilled' && fxRes.value?.rates?.TWD) {
        updatedMid = Number(fxRes.value.rates.TWD.toFixed(4));
        sourceParts.push('ER-API 外匯');
      }

      if (cgRes.status === 'fulfilled' && cgRes.value?.tether) {
        if (cgRes.value.tether.aud) {
          updatedCs = Number(cgRes.value.tether.aud.toFixed(4));
        }
        if (cgRes.value.tether.twd) {
          updatedMax = Number(cgRes.value.tether.twd.toFixed(4));
        }
        sourceParts.push('CoinGecko USDT');
      }

      // 嘗試直接抓取 MAX 官方公開 Ticker
      try {
        const maxRes = await fetch('https://max-api.maicoin.com/api/v2/tickers/usdttwd');
        if (maxRes.ok) {
          const maxData = await maxRes.json();
          if (maxData?.buy) {
            updatedMax = Number(parseFloat(maxData.buy).toFixed(4));
            sourceParts.push('MAX 官方盤口');
          }
        }
      } catch (_) {
        // 瀏覽器 CORS 阻擋時自動保留 CoinGecko 或原生注入報價
      }

      setRates((prev) => ({
        ...prev,
        midAudTwd: updatedMid,
        csUsdtAud: updatedCs,
        maxUsdtTwd: updatedMax
      }));

      const now = new Date();
      setLastUpdated(
        now.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      if (sourceParts.length > 0) {
        setDataSourceLabel(sourceParts.join(' + '));
      }
      setCountdown(30);
    } catch (err) {
      console.error('匯率同步失敗:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [rates.midAudTwd, rates.csUsdtAud, rates.maxUsdtTwd]);

  // 接收 iOS 原生 Swift 層無 CORS 抓取的官方 CoinSpot + MAX 報價
  useEffect(() => {
    window.__updateNativeRates = (payload) => {
      if (!payload) return;
      setRates((prev) => ({
        ...prev,
        midAudTwd: payload.midAudTwd || prev.midAudTwd,
        csUsdtAud: payload.csUsdtAud || prev.csUsdtAud,
        maxUsdtTwd: payload.maxUsdtTwd || prev.maxUsdtTwd
      }));
      const now = new Date();
      setLastUpdated(
        now.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setDataSourceLabel('iOS 原生直連 (CoinSpot + MAX + 外匯)');
    };
    fetchLiveQuotes();
    return () => {
      delete window.__updateNativeRates;
    };
  }, []);

  // 30 秒倒數自動輪詢
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLiveQuotes();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLiveQuotes]);

  // 核心計算函數：給定 AUD 算實拿 TWD
  const calcFromAud = useCallback(
    (audAmount) => {
      const midTwd = audAmount * rates.midAudTwd;

      // 1. ING 台灣免設備費 ATM 直領 (0% 海外手續費 + 0 元台銀/國泰/元大 ATM 設備費)
      const ingNetTwd = audAmount * visaRate;
      const ingEffRate = audAmount > 0 ? ingNetTwd / audAmount : 0;
      const ingLossTwd = midTwd - ingNetTwd;

      // 2. CoinSpot 0.1% Market Order 掛單轉 MAX
      const cs01UsdtBought = (audAmount * (1 - 0.001)) / rates.csUsdtAud;
      const cs01UsdtArrived = Math.max(0, cs01UsdtBought - trc20GasUsdt);
      const cs01TwdGross = cs01UsdtArrived * rates.maxUsdtTwd * (1 - maxTradeFeePct / 100);
      const cs01NetTwd = Math.max(0, cs01TwdGross - maxWithdrawalFee);
      const cs01EffRate = audAmount > 0 ? cs01NetTwd / audAmount : 0;
      const cs01LossTwd = midTwd - cs01NetTwd;

      // 3. CoinSpot 1.0% Instant Buy 一鍵買轉 MAX
      const cs10UsdtBought = (audAmount * (1 - 0.01)) / rates.csUsdtAud;
      const cs10UsdtArrived = Math.max(0, cs10UsdtBought - trc20GasUsdt);
      const cs10TwdGross = cs10UsdtArrived * rates.maxUsdtTwd * (1 - maxTradeFeePct / 100);
      const cs10NetTwd = Math.max(0, cs10TwdGross - maxWithdrawalFee);
      const cs10EffRate = audAmount > 0 ? cs10NetTwd / audAmount : 0;
      const cs10LossTwd = midTwd - cs10NetTwd;

      const methods = [
        {
          id: 'ing_free_atm',
          name: 'ING 免設備費 ATM 直領',
          badge: '台銀/國泰/元大 $0 設備費',
          primaryValue: ingNetTwd,
          effRate: ingEffRate,
          lossTwd: ingLossTwd,
          usdtDetail: '直接刷 Visa 即期匯率結算',
          feeBreakdown: `Visa 匯差 ~${rates.visaSpreadPct}% · ING 手續費 $0`
        },
        {
          id: 'cs_market_01',
          name: 'CoinSpot 0.1% 掛單 → MAX',
          badge: 'Market Order 0.1% + TRC20',
          primaryValue: cs01NetTwd,
          effRate: cs01EffRate,
          lossTwd: cs01LossTwd,
          usdtDetail: `買入 ${cs01UsdtBought.toFixed(2)} → 到帳 ${cs01UsdtArrived.toFixed(2)} USDT`,
          feeBreakdown: `買幣 0.1% · 提幣 ${trc20GasUsdt}U · MAX ${maxTradeFeePct}% + $${maxWithdrawalFee}`
        },
        {
          id: 'cs_instant_10',
          name: 'CoinSpot 1.0% 一鍵買 → MAX',
          badge: 'Instant Buy 1.0% + TRC20',
          primaryValue: cs10NetTwd,
          effRate: cs10EffRate,
          lossTwd: cs10LossTwd,
          usdtDetail: `買入 ${cs10UsdtBought.toFixed(2)} → 到帳 ${cs10UsdtArrived.toFixed(2)} USDT`,
          feeBreakdown: `買幣 1.0% · 提幣 ${trc20GasUsdt}U · MAX ${maxTradeFeePct}% + $${maxWithdrawalFee}`
        }
      ];

      const sorted = [...methods].sort((a, b) => b.primaryValue - a.primaryValue);
      const best = sorted[0];
      const second = sorted[1];

      return {
        methods,
        bestId: best.id,
        bestName: best.name,
        bestValue: best.primaryValue,
        diffFromSecond: best.primaryValue - second.primaryValue,
        midTwd
      };
    },
    [rates, visaRate, trc20GasUsdt, maxTradeFeePct, maxWithdrawalFee]
  );

  // 核心計算函數：給定目標實拿 TWD 反推所需 AUD
  const calcFromTwd = useCallback(
    (targetTwd) => {
      const midAud = targetTwd / rates.midAudTwd;

      // 1. ING 免設備費 ATM 直領所需 AUD
      const ingReqAud = targetTwd / visaRate;
      const ingEffRate = ingReqAud > 0 ? targetTwd / ingReqAud : 0;
      const ingExtraAud = ingReqAud - midAud;

      // 2. CoinSpot 0.1% 掛單轉 MAX 所需 AUD
      const usdtNeededMax = (targetTwd + maxWithdrawalFee) / (rates.maxUsdtTwd * (1 - maxTradeFeePct / 100));
      const usdtToBuy = usdtNeededMax + trc20GasUsdt;
      const cs01ReqAud = (usdtToBuy * rates.csUsdtAud) / (1 - 0.001);
      const cs01EffRate = cs01ReqAud > 0 ? targetTwd / cs01ReqAud : 0;
      const cs01ExtraAud = cs01ReqAud - midAud;

      // 3. CoinSpot 1.0% 一鍵買轉 MAX 所需 AUD
      const cs10ReqAud = (usdtToBuy * rates.csUsdtAud) / (1 - 0.01);
      const cs10EffRate = cs10ReqAud > 0 ? targetTwd / cs10ReqAud : 0;
      const cs10ExtraAud = cs10ReqAud - midAud;

      const methods = [
        {
          id: 'ing_free_atm',
          name: 'ING 免設備費 ATM 直領',
          badge: '台銀/國泰/元大 $0 設備費',
          primaryValue: ingReqAud,
          effRate: ingEffRate,
          lossTwd: ingExtraAud * rates.midAudTwd,
          usdtDetail: `ATM 領現 NT$${targetTwd.toLocaleString()}`,
          feeBreakdown: `Visa 匯率 ${visaRate} · 免跨國提款費`
        },
        {
          id: 'cs_market_01',
          name: 'CoinSpot 0.1% 掛單 → MAX',
          badge: 'Market Order 0.1% + TRC20',
          primaryValue: cs01ReqAud,
          effRate: cs01EffRate,
          lossTwd: cs01ExtraAud * rates.midAudTwd,
          usdtDetail: `需買 ${usdtToBuy.toFixed(2)} U → MAX 賣 ${usdtNeededMax.toFixed(2)} U`,
          feeBreakdown: `買幣 0.1% · 提幣 ${trc20GasUsdt}U · MAX ${maxTradeFeePct}% + $${maxWithdrawalFee}`
        },
        {
          id: 'cs_instant_10',
          name: 'CoinSpot 1.0% 一鍵買 → MAX',
          badge: 'Instant Buy 1.0% + TRC20',
          primaryValue: cs10ReqAud,
          effRate: cs10EffRate,
          lossTwd: cs10ExtraAud * rates.midAudTwd,
          usdtDetail: `需買 ${usdtToBuy.toFixed(2)} U → MAX 賣 ${usdtNeededMax.toFixed(2)} U`,
          feeBreakdown: `買幣 1.0% · 提幣 ${trc20GasUsdt}U · MAX ${maxTradeFeePct}% + $${maxWithdrawalFee}`
        }
      ];

      // 反推模式下，所需澳幣越少越划算
      const sorted = [...methods].sort((a, b) => a.primaryValue - b.primaryValue);
      const best = sorted[0];
      const second = sorted[1];

      return {
        methods,
        bestId: best.id,
        bestName: best.name,
        bestValue: best.primaryValue,
        diffFromSecond: second.primaryValue - best.primaryValue,
        midAud
      };
    },
    [rates, visaRate, trc20GasUsdt, maxTradeFeePct, maxWithdrawalFee]
  );

  // 當前主試算結果
  const currentResult = useMemo(() => {
    return mode === 'AUD_TO_TWD' ? calcFromAud(audInput) : calcFromTwd(twdInput);
  }, [mode, audInput, twdInput, calcFromAud, calcFromTwd]);

  // 計算黃金交叉點 (Breakeven Point)：何時 CoinSpot 0.1% 開始贏過 ING 免設備費 ATM
  const breakevenInfo = useMemo(() => {
    const slopeCrypto = (0.999 / rates.csUsdtAud) * rates.maxUsdtTwd * (1 - maxTradeFeePct / 100);
    const fixedCostTwd = trc20GasUsdt * rates.maxUsdtTwd * (1 - maxTradeFeePct / 100) + maxWithdrawalFee;
    const rateDiff = slopeCrypto - visaRate;

    if (rateDiff <= 0) {
      return {
        hasCross: false,
        message: '當前匯率下，不論金額大小皆由「ING 免設備費 ATM 直領」勝出'
      };
    }
    const crossAud = Math.ceil(fixedCostTwd / rateDiff);
    const crossTwd = Math.round(crossAud * visaRate);
    return {
      hasCross: true,
      crossAud,
      crossTwd,
      message: `低於 ${crossAud.toLocaleString()} AUD (約 NT$${crossTwd.toLocaleString()}) 選 ING 直領；高於此金額選 CoinSpot 0.1% 掛單轉 MAX 更划算`
    };
  }, [rates, visaRate, maxTradeFeePct, trc20GasUsdt, maxWithdrawalFee]);

  // 矩陣速查表預設檔位
  const matrixRows = useMemo(() => {
    if (mode === 'AUD_TO_TWD') {
      const presets = [300, 520, 800, 1000, 1500, 2000, 3000, 5000];
      return presets.map((aud) => {
        const res = calcFromAud(aud);
        const ing = res.methods.find((m) => m.id === 'ing_free_atm').primaryValue;
        const cs01 = res.methods.find((m) => m.id === 'cs_market_01').primaryValue;
        const cs10 = res.methods.find((m) => m.id === 'cs_instant_10').primaryValue;
        return {
          inputAmount: aud,
          ing,
          cs01,
          cs10,
          bestId: res.bestId,
          bestName: res.bestId === 'ing_free_atm' ? 'ING ATM' : 'CoinSpot 0.1%',
          diff: res.diffFromSecond
        };
      });
    } else {
      const presets = [5000, 10000, 15000, 20000, 30000, 50000, 80000, 100000];
      return presets.map((twd) => {
        const res = calcFromTwd(twd);
        const ing = res.methods.find((m) => m.id === 'ing_free_atm').primaryValue;
        const cs01 = res.methods.find((m) => m.id === 'cs_market_01').primaryValue;
        const cs10 = res.methods.find((m) => m.id === 'cs_instant_10').primaryValue;
        return {
          inputAmount: twd,
          ing,
          cs01,
          cs10,
          bestId: res.bestId,
          bestName: res.bestId === 'ing_free_atm' ? 'ING ATM' : 'CoinSpot 0.1%',
          diff: res.diffFromSecond
        };
      });
    }
  }, [mode, calcFromAud, calcFromTwd]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12 selection:bg-emerald-500 selection:text-slate-950">
      {/* 頂部導航與即時連線狀態列 */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ArrowRightLeft className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  AUD ⇄ TWD 匯兌精算 Pro
                </h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  免設備費 ATM 專版
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span>{dataSourceLabel}</span>
                <span>·</span>
                <span>更新於 {lastUpdated}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                autoRefresh
                  ? 'bg-slate-900 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {autoRefresh ? `${countdown}s 自動刷新` : '自動刷新已暫停'}
            </button>

            <button
              onClick={fetchLiveQuotes}
              disabled={isSyncing}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center gap-1.5 shadow-md shadow-emerald-500/10 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              立即聯網更新
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
        {/* 即時匯率四宮格 (可直接點擊微調盤口數字) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>外匯中價 (AUD/TWD)</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">LIVE</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <input
                type="number"
                step="0.01"
                value={rates.midAudTwd}
                onChange={(e) => setRates({ ...rates, midAudTwd: parseFloat(e.target.value) || 0 })}
                className="w-full bg-transparent text-xl font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded px-1 -ml-1"
              />
              <span className="text-xs text-slate-400">TWD</span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>ING Visa 即期匯率</span>
              <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">$0 手續費</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-xl font-bold text-cyan-300">{visaRate.toFixed(4)}</span>
              <span className="text-xs text-slate-400">匯差 {rates.visaSpreadPct}%</span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>CoinSpot (USDT/AUD)</span>
              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">可微調</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <input
                type="number"
                step="0.0001"
                value={rates.csUsdtAud}
                onChange={(e) => setRates({ ...rates, csUsdtAud: parseFloat(e.target.value) || 0.01 })}
                className="w-full bg-transparent text-xl font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500 rounded px-1 -ml-1"
              />
              <span className="text-xs text-slate-400">AUD</span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>台灣 MAX (USDT/TWD)</span>
              <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">可微調</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <input
                type="number"
                step="0.01"
                value={rates.maxUsdtTwd}
                onChange={(e) => setRates({ ...rates, maxUsdtTwd: parseFloat(e.target.value) || 1 })}
                className="w-full bg-transparent text-xl font-bold text-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded px-1 -ml-1"
              />
              <span className="text-xs text-slate-400">TWD</span>
            </div>
          </div>
        </section>

        {/* 雙向模式切換與金額拉桿控制區 */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                onClick={() => setMode('AUD_TO_TWD')}
                className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  mode === 'AUD_TO_TWD'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                輸入澳幣 (AUD) → 算實拿台幣
              </button>
              <button
                onClick={() => setMode('TWD_TO_AUD')}
                className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  mode === 'TWD_TO_AUD'
                    ? 'bg-cyan-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                指定目標台幣 (TWD) → 反推澳幣
              </button>
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>手續費參數微調</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* 金額輸入與滑桿 */}
          {mode === 'AUD_TO_TWD' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-300">
                  準備轉換的澳幣金額 (AUD)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={audInput}
                    onChange={(e) => setAudInput(Math.max(10, Number(e.target.value) || 0))}
                    className="w-32 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-right text-lg font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-sm font-semibold text-slate-400">AUD</span>
                </div>
              </div>
              <input
                type="range"
                min="100"
                max="5000"
                step="20"
                value={Math.min(5000, audInput)}
                onChange={(e) => setAudInput(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {[300, 520, 800, 1000, 1500, 2000, 3000, 5000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAudInput(preset)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                      audInput === preset
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {preset.toLocaleString()} AUD
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-300">
                  目標實拿新台幣金額 (TWD)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1000"
                    value={twdInput}
                    onChange={(e) => setTwdInput(Math.max(500, Number(e.target.value) || 0))}
                    className="w-36 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-right text-lg font-bold text-cyan-300 focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-sm font-semibold text-slate-400">TWD</span>
                </div>
              </div>
              <input
                type="range"
                min="2000"
                max="100000"
                step="1000"
                value={Math.min(100000, twdInput)}
                onChange={(e) => setTwdInput(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {[5000, 10000, 20000, 30000, 50000, 80000, 100000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setTwdInput(preset)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                      twdInput === preset
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    NT$ {preset.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 進階手續費微調摺疊面板 */}
          {showAdvanced && (
            <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                <div className="text-slate-400 font-medium">MAX 台幣出金銀行</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMaxWithdrawalFee(30)}
                    className={`flex-1 py-1.5 rounded-lg border ${
                      maxWithdrawalFee === 30
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-semibold'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    一般銀行 ($30)
                  </button>
                  <button
                    onClick={() => setMaxWithdrawalFee(0)}
                    className={`flex-1 py-1.5 rounded-lg border ${
                      maxWithdrawalFee === 0
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-semibold'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    遠東 Bankee ($0)
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                <div className="text-slate-400 font-medium">MAX 賣單交易手續費</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMaxTradeFeePct(0.08)}
                    className={`flex-1 py-1.5 rounded-lg border ${
                      maxTradeFeePct === 0.08
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-semibold'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    Maker 掛單 0.08%
                  </button>
                  <button
                    onClick={() => setMaxTradeFeePct(0.16)}
                    className={`flex-1 py-1.5 rounded-lg border ${
                      maxTradeFeePct === 0.16
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-semibold'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    Taker 吃單 0.16%
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between text-slate-400 font-medium">
                  <span>Visa 即期匯差 (%)</span>
                  <span className="text-cyan-300">{rates.visaSpreadPct}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.2"
                  step="0.05"
                  value={rates.visaSpreadPct}
                  onChange={(e) => setRates({ ...rates, visaSpreadPct: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          )}
        </section>

        {/* 最優方案結論橫幅與黃金交叉提示 */}
        <section className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-cyan-950/70 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Award className="w-4 h-4" />
              <span>當前金額最划算方案</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              {currentResult.bestName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              {breakevenInfo.message}
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-right shrink-0">
            <div className="text-xs text-slate-400">
              {mode === 'AUD_TO_TWD' ? '最高實拿新台幣' : '最低應扣澳幣成本'}
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {mode === 'AUD_TO_TWD'
                ? `NT$ ${Math.round(currentResult.bestValue).toLocaleString()}`
                : `${currentResult.bestValue.toFixed(2)} AUD`}
            </div>
            <div className="text-xs text-emerald-300/90 mt-0.5">
              比第二名多省下{' '}
              {mode === 'AUD_TO_TWD'
                ? `NT$ ${Math.round(currentResult.diffFromSecond).toLocaleString()}`
                : `${currentResult.diffFromSecond.toFixed(2)} AUD (約 NT$${Math.round(
                    currentResult.diffFromSecond * rates.midAudTwd
                  )})`}
            </div>
          </div>
        </section>

        {/* 表格一：三大方案即時精算對比表 (已移除收費 ATM) */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm sm:text-base font-bold text-white">
                三大方案即時精算對比表（免設備費 ATM vs CoinSpot 轉 MAX）
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              {mode === 'AUD_TO_TWD' ? `基準：${audInput} AUD` : `目標：NT$ ${twdInput.toLocaleString()}`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] sm:text-xs text-slate-400 bg-slate-950/50">
                  <th className="py-3 px-4">轉換管道與模式</th>
                  <th className="py-3 px-4 text-right">
                    {mode === 'AUD_TO_TWD' ? '最終實拿台幣' : '實際需花澳幣'}
                  </th>
                  <th className="py-3 px-4 text-right">與最佳方案差額</th>
                  <th className="py-3 px-4 text-right">折合有效匯率</th>
                  <th className="py-3 px-4">中間轉換與費用拆解</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                {currentResult.methods.map((item) => {
                  const isBest = item.id === currentResult.bestId;
                  const diff =
                    mode === 'AUD_TO_TWD'
                      ? currentResult.bestValue - item.primaryValue
                      : item.primaryValue - currentResult.bestValue;

                  return (
                    <tr
                      key={item.id}
                      className={`transition ${
                        isBest ? 'bg-emerald-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{item.name}</span>
                          {isBest && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950">
                              最划算
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{item.badge}</div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-extrabold text-base">
                        <span className={isBest ? 'text-emerald-400' : 'text-slate-100'}>
                          {mode === 'AUD_TO_TWD'
                            ? `NT$ ${Math.round(item.primaryValue).toLocaleString()}`
                            : `${item.primaryValue.toFixed(2)} AUD`}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-semibold">
                        {isBest ? (
                          <span className="text-emerald-400">基準最優</span>
                        ) : (
                          <span className="text-rose-400">
                            {mode === 'AUD_TO_TWD'
                              ? `- NT$ ${Math.round(diff).toLocaleString()}`
                              : `+ ${diff.toFixed(2)} AUD`}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                        {item.effRate.toFixed(4)}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-xs text-slate-200">{item.usdtDetail}</div>
                        <div className="text-[11px] text-slate-400">{item.feeBreakdown}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 表格二：全額度動態速查矩陣表 */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm sm:text-base font-bold text-white">
                全額度動態速查矩陣表（點擊任一列直接切換試算）
              </h3>
            </div>
            <span className="text-xs text-slate-400">隨上方即時匯率同步重算</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] sm:text-xs text-slate-400 bg-slate-950/50">
                  <th className="py-2.5 px-4">
                    {mode === 'AUD_TO_TWD' ? '轉換澳幣 (AUD)' : '目標台幣 (TWD)'}
                  </th>
                  <th className="py-2.5 px-4 text-right">ING 免設備費 ATM</th>
                  <th className="py-2.5 px-4 text-right">CoinSpot 0.1% 掛單</th>
                  <th className="py-2.5 px-4 text-right">CoinSpot 1.0% 一鍵買</th>
                  <th className="py-2.5 px-4 text-right">勝出方案與差額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                {matrixRows.map((row) => {
                  const isSelected =
                    (mode === 'AUD_TO_TWD' && audInput === row.inputAmount) ||
                    (mode === 'TWD_TO_AUD' && twdInput === row.inputAmount);

                  return (
                    <tr
                      key={row.inputAmount}
                      onClick={() =>
                        mode === 'AUD_TO_TWD'
                          ? setAudInput(row.inputAmount)
                          : setTwdInput(row.inputAmount)
                      }
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-cyan-500/15' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-3 px-4 font-bold text-white">
                        {mode === 'AUD_TO_TWD'
                          ? `${row.inputAmount.toLocaleString()} AUD`
                          : `NT$ ${row.inputAmount.toLocaleString()}`}
                      </td>

                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          row.bestId === 'ing_free_atm'
                            ? 'text-emerald-400 font-bold'
                            : 'text-slate-300'
                        }`}
                      >
                        {mode === 'AUD_TO_TWD'
                          ? `NT$ ${Math.round(row.ing).toLocaleString()}`
                          : `${row.ing.toFixed(2)} AUD`}
                      </td>

                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          row.bestId === 'cs_market_01'
                            ? 'text-emerald-400 font-bold'
                            : 'text-slate-300'
                        }`}
                      >
                        {mode === 'AUD_TO_TWD'
                          ? `NT$ ${Math.round(row.cs01).toLocaleString()}`
                          : `${row.cs01.toFixed(2)} AUD`}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {mode === 'AUD_TO_TWD'
                          ? `NT$ ${Math.round(row.cs10).toLocaleString()}`
                          : `${row.cs10.toFixed(2)} AUD`}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            row.bestId === 'ing_free_atm'
                              ? 'bg-cyan-500/15 text-cyan-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {row.bestName} 勝 (
                          {mode === 'AUD_TO_TWD'
                            ? `+NT$${Math.round(row.diff)}`
                            : `省 ${row.diff.toFixed(2)} AUD`}
                          )
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
