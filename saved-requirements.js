/* Restore the same saved home requirements used by the mobile app. */
(() => {
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const strings = value => Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];
  function flags(value) {
    const c = object(value), power = strings(c.electricity), water = strings(c.water);
    return ['electricity','inverter','solar','water'].filter(key => c[key] === true ||
      (key === 'electricity' ? power.includes('grid') : key === 'water' ? water.includes('public_water') : power.includes(key)));
  }
  window.LajemboSavedRequirements = async function() {
    const client = window.LajemboAuth.client;
    const {data: auth, error: authError} = await client.auth.getUser();
    if (authError || !auth.user) throw Error('Sign in again to load your saved requirements.');
    const userId = auth.user.id;
    const {data, error} = await client.from('home_profiles')
      .select('profile_name,minimum_budget,maximum_budget,maximum_move_in_cost,move_in_date,bedrooms_min,must_have,preferences')
      .eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);
    if (error) throw error;
    const current = await client.auth.getSession();
    if (current.error || current.data.session?.user.id !== userId) throw Error('Your account changed. Reload to continue.');
    const row = data?.[0];
    if (!row) return {};
    const p = object(row.preferences);
    function set(id,value) {
      const field = document.getElementById(id), text = value == null ? '' : String(value);
      if (field.tagName === 'SELECT' && text && ![...field.options].some(o => o.value === text)) {
        const option = document.createElement('option'); option.value = text; option.textContent = text; field.append(option);
      }
      field.value = text;
    }
    for (const [id,value] of Object.entries({
      profileName:row.profile_name, minimumBudget:row.minimum_budget, maximumBudget:row.maximum_budget,
      maximumMoveInCost:row.maximum_move_in_cost, moveInDate:row.move_in_date, bedrooms:row.bedrooms_min,
      bathrooms:p.bathrooms_min, propertyType:p.property_type, preferredAreas:strings(p.preferred_areas).join(', '),
      furnished:p.furnished || 'any', serviced:p.serviced || 'any'
    })) set(id,value);
    for (const [id,value] of [['mustHave',row.must_have],['preferredFeatures',p.preferred_features]]) {
      const saved = flags(value);
      document.getElementById(id).querySelectorAll('input').forEach(input => {input.checked = saved.includes(input.value)});
    }
    return object(p.commute);
  };
})();
