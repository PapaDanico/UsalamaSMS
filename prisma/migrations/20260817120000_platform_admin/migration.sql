-- The vendor's own role, which provisions tenants and confirms payment
-- and holds no safety permission at all.
--
-- SYSTEM_ADMIN administers one operator's account. PLATFORM_ADMIN
-- administers the operators. Keeping them apart is what lets the
-- privacy claim survive contact with a support request: nobody at the
-- vendor can open a reporter's narrative, because no vendor role
-- carries a permission that reaches one.
ALTER TYPE "Role" ADD VALUE 'PLATFORM_ADMIN';
