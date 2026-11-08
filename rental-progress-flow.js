(() => {
 'use strict';
 const costFields=['annual_rent','platform_fee','caution_deposit','legal_documentation_fee','service_charge','other_approved_charges','total_move_in_cost'];
 function create(client){
  async function rpc(name,args){const result=await client.rpc(name,args);if(result.error)throw Error(result.error.message);return result.data;}
  async function selection(){return rpc('get_my_selection_progress');}
  async function acceptCosts(shown){
   if(!shown?.selection_intent_id||!shown.costs)throw Error('Load the disclosed costs before accepting them.');
   const current=await selection();
   if(!current||current.selection_intent_id!==shown.selection_intent_id||!current.costs||
    costFields.some(field=>current.costs[field]!==shown.costs[field]))throw Error('Your selection or costs changed. Refresh and review the current amounts.');
   if(current.costs.confirmed_by_renter)return;
   await rpc('accept_my_selection_costs',{p_selection_intent_id:current.selection_intent_id});
  }
  async function workspace(){const current=await selection();if(!current?.transaction_id)return null;return rpc('get_my_transaction_workspace',{p_transaction_id:current.transaction_id});}
  return{selection,acceptCosts,workspace};
 }
 window.LajemboRentalProgress={create};
})();
