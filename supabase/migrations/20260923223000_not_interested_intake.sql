-- Unsorted SendPilot Not Interested leads belong in the Not Interested
-- intake column. The previous file defaulted them to Nurture.

update public.leads
set not_interested_outcome = null
where sendpilot_status = 'Not Interested'
  and not_interested_outcome = 'Nurture';
