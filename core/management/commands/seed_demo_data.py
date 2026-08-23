from decimal import Decimal

from django.core.management.base import BaseCommand

from core.models import Card, Destination, Dispatcher, Driver, FeeSettings, Line, Passenger, Terminal, User, Vehicle


class Command(BaseCommand):
    help = 'Populate the database with baseline demo data for local development.'

    def handle(self, *args, **options):
        created_items = []
        reused_items = []

        admin_user, admin_created = User.objects.get_or_create(username='admin')
        admin_user.set_password('adminpass123')
        admin_user.role = User.Role.ADMIN
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.is_active = True
        admin_user.save()
        self._record_result(
            'Admin user',
            admin_created,
            created_items,
            reused_items,
        )

        cashier_user, cashier_created = User.objects.get_or_create(username='cashier1')
        cashier_user.set_password('cashierpass123')
        cashier_user.role = User.Role.CASHIER
        cashier_user.is_active = True
        cashier_user.save()
        self._record_result(
            'Cashier user',
            cashier_created,
            created_items,
            reused_items,
        )

        terminal_data = ['Terminal A', 'Terminal B']
        terminals = []
        for terminal_name in terminal_data:
            terminal, terminal_created = Terminal.objects.get_or_create(name=terminal_name)
            terminals.append(terminal)
            self._record_result(
                f'Terminal: {terminal_name}',
                terminal_created,
                created_items,
                reused_items,
            )

        driver_data = [
            ('Ramon Villanueva', '09171234568'),
            ('Josefina Manalo', '09181234568'),
            ('Danilo Mercado', '09191234568'),
        ]
        drivers = []
        for full_name, contact_number in driver_data:
            driver, driver_created = Driver.objects.get_or_create(
                full_name=full_name,
                defaults={'contact_number': contact_number},
            )
            if not driver_created:
                driver.contact_number = contact_number
                driver.save(update_fields=['contact_number'])
            drivers.append(driver)
            self._record_result(
                f'Driver: {full_name}',
                driver_created,
                created_items,
                reused_items,
            )

        dispatcher_data = [
            ('Lorna Bautista', '09171234569'),
            ('Nestor Garcia', '09181234569'),
        ]
        dispatchers = []
        for full_name, contact_number in dispatcher_data:
            dispatcher, dispatcher_created = Dispatcher.objects.get_or_create(
                full_name=full_name,
                defaults={'contact_number': contact_number},
            )
            if not dispatcher_created:
                dispatcher.contact_number = contact_number
                dispatcher.save(update_fields=['contact_number'])
            dispatchers.append(dispatcher)
            self._record_result(
                f'Dispatcher: {full_name}',
                dispatcher_created,
                created_items,
                reused_items,
            )

        fee_settings_created = not FeeSettings.objects.filter(pk=1).exists()
        fee_settings = FeeSettings.get_current()
        fee_settings.terminal_fee_percentage = Decimal('10.00')
        fee_settings.ps_fee = Decimal('20.00')
        fee_settings.water_fee = Decimal('10.00')
        fee_settings.dispatcher_collection_fee = Decimal('15.00')
        fee_settings.ftb = Decimal('10.00')
        fee_settings.savings = Decimal('20.00')
        fee_settings.trust_fund = Decimal('20.00')
        fee_settings.save()
        self._record_result('FeeSettings: current defaults', fee_settings_created, created_items, reused_items)

        passenger_data = [
            ('Juan Dela Cruz', '09171234567', Passenger.DiscountType.REGULAR, 'CARD001'),
            ('Maria Santos', '09181234567', Passenger.DiscountType.STUDENT, 'CARD002'),
            ('Elena Reyes', '09191234567', Passenger.DiscountType.SENIOR, 'CARD003'),
        ]

        for full_name, contact_number, discount_type, card_uid in passenger_data:
            passenger, passenger_created = Passenger.objects.get_or_create(
                full_name=full_name,
                defaults={
                    'contact_number': contact_number,
                    'discount_type': discount_type,
                },
            )
            if not passenger_created:
                passenger.contact_number = contact_number
                passenger.discount_type = discount_type
                passenger.save(update_fields=['contact_number', 'discount_type'])
            self._record_result(
                f'Passenger: {full_name}',
                passenger_created,
                created_items,
                reused_items,
            )

            card, card_created = Card.objects.get_or_create(
                uid=card_uid,
                defaults={
                    'passenger': passenger,
                    'balance': Decimal('100.00'),
                    'status': Card.Status.ACTIVE,
                },
            )
            if not card_created:
                card.passenger = passenger
                card.status = Card.Status.ACTIVE
                card.save(update_fields=['passenger', 'status'])
            self._record_result(
                f'Card: {card_uid}',
                card_created,
                created_items,
                reused_items,
            )

        line, line_created = Line.objects.get_or_create(name='Calinan-Bangkerohan')
        self._record_result('Line: Calinan-Bangkerohan', line_created, created_items, reused_items)

        vehicle, vehicle_created = Vehicle.objects.get_or_create(
            plate_number='ABC-1234',
            defaults={
                'line': line,
                'is_active': True,
            },
        )
        if not vehicle_created:
            vehicle.line = line
            vehicle.assigned_driver = drivers[0]
            vehicle.is_active = True
            vehicle.save(update_fields=['line', 'assigned_driver', 'is_active'])
        elif vehicle.assigned_driver_id != drivers[0].id:
            vehicle.assigned_driver = drivers[0]
            vehicle.save(update_fields=['assigned_driver'])
        self._record_result('Vehicle assigned driver: Ramon Villanueva', False, created_items, reused_items)
        self._record_result('Vehicle: ABC-1234', vehicle_created, created_items, reused_items)

        route_data = [
            ('Mintal', '30.00', True),
            ('Green Meadows', '35.00', False),
            ('Rosalina', '40.00', False),
            ('Bangkal', '45.00', False),
            ('Matina', '45.00', False),
            ('SM/Ecoland', '50.00', False),
            ('Roxas', '53.00', False),
            ('Bangkerohan', '55.00', False),
        ]
        for destination_name, base_fare, discount_exempt in route_data:
            destination, destination_created = Destination.objects.get_or_create(
                destination_name=destination_name,
                defaults={
                    'base_fare': Decimal(base_fare),
                    'discount_exempt': discount_exempt,
                    'is_active': True,
                },
            )
            if not destination_created:
                destination.base_fare = Decimal(base_fare)
                destination.discount_exempt = discount_exempt
                destination.is_active = True
                destination.save(update_fields=['base_fare', 'discount_exempt', 'is_active'])
            self._record_result(
                f'Destination: {destination_name}',
                destination_created,
                created_items,
                reused_items,
            )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Demo data is ready.'))
        self.stdout.write(f"Created or refreshed: {len(created_items) + len(reused_items)} records")
        self.stdout.write(f"Newly created: {len(created_items)}")
        self.stdout.write(f"Reused: {len(reused_items)}")
        self.stdout.write('')
        self.stdout.write('Demo account credentials:')
        self.stdout.write('  admin    / adminpass123')
        self.stdout.write('  cashier1 / cashierpass123')
        self.stdout.write('')
        self.stdout.write('Terminals: Terminal A, Terminal B')
        self.stdout.write('Drivers: Ramon Villanueva, Josefina Manalo, Danilo Mercado')
        self.stdout.write('Dispatchers: Lorna Bautista, Nestor Garcia')
        self.stdout.write('Current FeeSettings: terminal 10.00%, PS 20.00, water 10.00, dispatcher 15.00, FTB 10.00, savings 20.00, trust fund 20.00')
        self.stdout.write('Assigned demo driver: Ramon Villanueva -> ABC-1234')
        self.stdout.write('')
        self.stdout.write('Destinations by fare:')
        for destination in Destination.objects.filter(is_active=True).order_by('base_fare', 'destination_name'):
            self.stdout.write(f'  {destination.destination_name}: {destination.base_fare}')
        self.stdout.write('')
        self.stdout.write('Demo cards: CARD001, CARD002, CARD003 (starting balance: 100.00)')

    @staticmethod
    def _record_result(label, created, created_items, reused_items):
        if created:
            created_items.append(label)
        else:
            reused_items.append(label)
