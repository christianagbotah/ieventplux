'use client'
export function MarketplaceSelect({id,value,onChange,options,placeholder='Select an option',disabled=false}:{id:string;value:string;onChange:(value:string)=>void;options:readonly string[];placeholder?:string;disabled?:boolean}){
 return <select id={id} className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary" value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}><option value="">{placeholder}</option>{value&&!options.includes(value)&&<option value={value}>{value}</option>}{options.map(option=><option key={option} value={option}>{option}</option>)}</select>
}
