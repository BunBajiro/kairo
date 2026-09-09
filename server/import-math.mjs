import {historyWindow} from './market-history.mjs';
export const DURATIONS=[1,3,7,14,30,90];
export const IMPORT_CATEGORIES=[
 {id:'ships',name:'Ships',roots:[4],minimum:3},
 {id:'equipment',name:'Ship Equipment & Drones',roots:[9,157,955],minimum:20},
 {id:'ammo',name:'Ammunition',roots:[11],minimum:10000},
 {id:'implants',name:'Implants & Boosters',roots:[24],minimum:5},
 {id:'industry',name:'Industry & Trade Goods',roots:[19,475,1320],minimum:1000},
 {id:'structures',name:'Structures & Equipment',roots:[477,2202,2203],minimum:2},
 {id:'blueprints',name:'Blueprints & Skills',roots:[2,150],minimum:3},
 {id:'misc',name:'Misc',roots:[],minimum:5}
];
export const importCategory=root=>IMPORT_CATEGORIES.find(g=>g.roots.includes(root))||IMPORT_CATEGORIES.at(-1);
export const DEFAULT_IMPORT_SETTINGS={characterId:0,cargo:10000,budget:1000000000,maxTrips:3,turnoverDays:7,demandShare:10,minROI:15,minProfit:500000,haulPerTrip:0,relistCount:1,structureBroker:null};
export function validateImportSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!(k in DEFAULT_IMPORT_SETTINGS)))throw new Error('Invalid import settings.');
 const r={...DEFAULT_IMPORT_SETTINGS,...value};
 const ranges={characterId:[0,1e12],cargo:[1,10000000],budget:[1000,1e15],maxTrips:[1,50],turnoverDays:[1,90],demandShare:[.1,100],minROI:[0,1000],minProfit:[0,1e12],haulPerTrip:[0,1e12],relistCount:[0,20],structureBroker:[.5,50]};
 for(const [key,[min,max]] of Object.entries(ranges)){if(key==='structureBroker'&&r[key]===null)continue;if(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<min||r[key]>max)throw new Error('Check the '+key+' value.');}
 for(const key of ['characterId','maxTrips','turnoverDays','relistCount'])if(!Number.isSafeInteger(r[key]))throw new Error(key+' must be a whole number.');return r;
}
export function tradingRates({accounting,brokerRelations,advancedBrokerRelations=0,faction=0,corporation=0,kind='station',structureBroker=null}){
 for(const n of [accounting,brokerRelations,advancedBrokerRelations])if(!Number.isInteger(n)||n<0||n>5)throw new Error('Trading skill level is unavailable.');
 for(const n of [faction,corporation])if(!Number.isFinite(n)||n< -10||n>10)throw new Error('Trading standing is unavailable.');
 if(kind==='structure'&&(!Number.isFinite(structureBroker)||structureBroker<.5||structureBroker>50))throw new Error('Enter the total broker fee shown at this structure, including the SCC surcharge.');
 return {salesTax:.075*(1-.11*accounting),broker:kind==='structure'?structureBroker/100:.03-.003*brokerRelations-.0003*faction-.0002*corporation,relistDiscount:.5+.05*advancedBrokerRelations,buyTax:0};
}
// EVE prices have four significant figures, with a minimum tick of 0.01 ISK.
export function marketPrice(value,up=false){if(!Number.isFinite(value)||value<=0)return 0;const tick=Math.max(.01,10**(Math.floor(Math.log10(value))-3));return Number(((up?Math.ceil(value/tick-1e-8):Math.floor(value/tick+1e-8))*tick).toFixed(2));}
export function undercut(price){const tick=Math.max(.01,10**(Math.floor(Math.log10(price*(1-1e-10)))-3));return marketPrice(price-tick);}
export function purchaseQuote(levels,quantity){let remaining=quantity,cost=0;const fills=[];for(const level of levels){if(remaining<=0)break;const n=Math.min(remaining,level.volume);if(n>0){cost+=n*level.price;fills.push({quantity:n,price:level.price,cost:n*level.price});remaining-=n;}}
 return {quantity:quantity-remaining,complete:remaining===0,cost,average:quantity>remaining?cost/(quantity-remaining):null,maxPrice:fills.at(-1)?.price||null,fills};
}
export function demandEvidence(rows,category,share,now){
 const windows=Object.fromEntries([1,3,7,30].map(d=>[d,historyWindow(rows,d,now)])),activeWindow=[1,3,7].find(d=>windows[d].volume*share/100>=category.minimum);
 const reliable=windows[7].active_days>=2&&windows[30].reported_days>=7&&windows[3].active_days>=1;
 // Regional executed volume includes buys and sells. Share is the user's assumed
 // capture of that total at this station, not an observed station statistic.
 const daily=Math.min(windows[7].daily_volume,windows[30].daily_volume)*share/100;
 return {windows,activeWindow:activeWindow||null,eligible:!!activeWindow&&reliable&&daily>0,daily,share,confidence:windows[30].reported_days>=21&&windows[7].reported_days>=5?'higher':'limited'};
}
export function scenario({levels,quantity,price,duration,volume,daily,rates,settings,strategy,localBuy=0}){
 if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isFinite(price)||price<=0||!DURATIONS.includes(duration))throw new Error('Choose a valid quantity, listing price and duration.');
 if(volume>settings.cargo)return null;
 const buy=purchaseQuote(levels,quantity);if(!buy.complete)return null;const unitsPerTrip=Math.floor((settings.cargo+1e-8)/volume),trips=Math.ceil(quantity/unitsPerTrip);if(trips>settings.maxTrips)return null;
 const revenue=price*quantity,brokerFee=Math.max(100,revenue*rates.broker),salesTax=revenue*rates.salesTax,relistReserve=settings.relistCount*Math.max(100,revenue*rates.broker*(1-rates.relistDiscount)),haul=trips*settings.haulPerTrip,upfront=buy.cost+brokerFee+haul,net=revenue-buy.cost-brokerFee-salesTax-relistReserve-haul,roi=net/upfront*100;
 const eta=daily>0?quantity/daily:null;
 return {strategy,quantity,price,duration,buy,revenue,brokerFee,salesTax,relistReserve,haul,upfront,net,roi,cargo:quantity*volume,unitVolume:volume,trips,eta,profitPerDay:eta?net/Math.max(1,eta):null,profitPerTrip:net/trips,budgetExceeded:upfront>settings.budget,durationShort:eta===null||eta>duration,crossesBuy:price<=localBuy,breakEven:marketPrice((buy.cost+haul+100*(1+settings.relistCount))/(quantity*(1-rates.salesTax-rates.broker*(1+settings.relistCount*(1-rates.relistDiscount)))),true)};
}
export function buildOpportunity({typeId,name,category,volume,levels,localSell,localBuy,localSupply,history,rates,settings,now,detail=false}){
 const demand=demandEvidence(history,category,settings.demandShare,now);if(!demand.eligible||!levels.length||!Number.isFinite(volume)||volume<=0||volume>settings.cargo)return null;
 const jita=levels[0].price,premium=localSell?(localSell/jita-1)*100:null;
 const scarcity=[3,7,30].filter(d=>localSupply<demand.windows[d].volume*settings.demandShare/100);
 if(!(premium>=20)&&!scarcity.length&&localSupply>0)return null;
 const historical=demand.windows[7].average||demand.windows[30].average||jita;
 const cheapest=localSell?undercut(localSell):marketPrice(Math.max(jita*1.5,historical),true);
 // Price response is a transparent scenario assumption, not a fitted sales forecast.
 const priceDemand=p=>demand.daily*Math.min(1,(historical/p)**2);
 const floor=marketPrice(jita*(1+settings.minROI/100)/(1-rates.salesTax-rates.broker*(1+settings.relistCount*(1-rates.relistDiscount))),true);
 const anchorTarget=marketPrice(Math.max(floor,Math.min(historical,jita*1.5),jita*1.25),true);
 const prices={anchoring:[anchorTarget,marketPrice(anchorTarget*.95),marketPrice(anchorTarget*1.05)],profiteering:[cheapest,marketPrice(Math.min(cheapest,historical*1.15)),marketPrice(Math.min(cheapest,Math.max(floor,historical)))]};
 const supply=levels.reduce((n,l)=>n+l.volume,0),maxUnits=Math.min(supply,Math.floor((settings.cargo+1e-8)/volume)*settings.maxTrips,Math.floor(settings.budget/jita),1000000000),choices={anchoring:[],profiteering:[]};
 for(const strategy of ['anchoring','profiteering'])for(const price of new Set(prices[strategy])){
  if(price<floor||price<=localBuy||price<=0||strategy==='anchoring'&&(!localSell||price>localSell*.9)||localSell&&price>=localSell)continue;
  const daily=priceDemand(price),maxDemand=Math.floor(daily*settings.turnoverDays);if(maxDemand<1)continue;
  let affordable=Math.min(maxUnits,maxDemand);const probe=q=>scenario({levels,quantity:q,price,duration:90,volume,daily,rates,settings,strategy,localBuy});if(affordable>0&&probe(affordable)?.budgetExceeded){let lo=0,hi=affordable;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(probe(mid)?.upfront<=settings.budget)lo=mid;else hi=mid-1;}affordable=lo;}if(!affordable)continue;
  const quantities=new Set([1,affordable,...DURATIONS.map(d=>Math.floor(daily*d*.75)),Math.floor((settings.cargo+1e-8)/volume),...levels.slice(0,6).map((_,i)=>levels.slice(0,i+1).reduce((n,l)=>n+l.volume,0))].map(q=>Math.min(affordable,q)).filter(q=>q>0));
  for(const quantity of quantities){const eta=quantity/daily;const duration=DURATIONS.find(d=>d>=eta*1.25)||90;const option=scenario({levels,quantity,price,duration,volume,daily,rates,settings,strategy,localBuy});if(!option||option.budgetExceeded||option.net<settings.minProfit||option.roi<settings.minROI||option.durationShort)continue;
   // Net return and cash velocity dominate; extra round trips reduce the score.
   option.score=option.net/Math.sqrt(Math.max(1,option.eta))/option.trips**.75*(1+Math.min(option.roi,200)/400);choices[strategy].push(option);
  }
 }
 for(const strategy of Object.keys(choices))choices[strategy].sort((a,b)=>b.score-a.score||a.upfront-b.upfront);
 const best={anchoring:choices.anchoring[0]||null,profiteering:choices.profiteering[0]||null},lead=best.profiteering||best.anchoring;if(!lead)return null;
 const tier=[1000,500,200,100].find(t=>premium>=t)||null,quality=1+(demand.activeWindow===1?.4:demand.activeWindow===3?.2:0)+Math.min(1,demand.windows[7].volume*settings.demandShare/100/category.minimum/10)+ (scarcity.includes(3)?.5:scarcity.includes(7)?.25:0)+1/(1+localSupply/demand.daily);
 return {typeId,name,category:category.id,volume,jita,localSell,localBuy,localSupply,premium,tier,scarcity,demand:{...demand,windows:Object.fromEntries(Object.entries(demand.windows).map(([k,w])=>[k,{...w,days:detail?w.days:undefined}]))},jitaSupply:supply,best,score:Math.max(best.anchoring?.score||0,best.profiteering?.score||0)*quality,alternatives:detail?Object.fromEntries(Object.entries(choices).map(([k,v])=>[k,v.slice(0,12)])):undefined,levels:detail?levels:undefined};
}
// Deterministic first-fit-decreasing packing; never split an individual hull.
export function packCargo(lines,capacity){const bins=[];let total=0;for(const l of [...lines].sort((a,b)=>b.unitVolume-a.unitVolume)){
 if(l.unitVolume>capacity)throw new Error('One item is larger than your cargo hold.');let q=l.quantity;total+=q*l.unitVolume;
 for(const b of bins){const n=Math.min(q,Math.floor((capacity-b.used+1e-7)/l.unitVolume));if(n>0){b.used+=n*l.unitVolume;b.items.push({typeId:l.typeId,quantity:n});q-=n;}if(!q)break;}
 const per=Math.floor((capacity+1e-8)/l.unitVolume);while(q){if(bins.length>=5000)throw new Error('This plan needs more than 5,000 trips. Reduce its quantities.');const n=Math.min(q,per);bins.push({used:n*l.unitVolume,items:[{typeId:l.typeId,quantity:n}]});q-=n;}
 }return {trips:bins.length,cargo:total,capacity,utilization:bins.length?total/(bins.length*capacity)*100:0,loads:bins};}
