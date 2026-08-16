from decimal import Decimal

from django.core.management.base import BaseCommand

from core.models import Card, Destination, Passenger, User, Vehicle


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

        vehicle, vehicle_created = Vehicle.objects.get_or_create(
            plate_number='ABC-1234',
            defaults={
                'route_name': 'Calinan-Bangkerohan',
                'is_active': True,
            },
        )
        if not vehicle_created:
            vehicle.route_name = 'Calinan-Bangkerohan'
            vehicle.is_active = True
            vehicle.save(update_fields=['route_name', 'is_active'])
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
