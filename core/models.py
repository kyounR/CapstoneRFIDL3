from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q, Sum


class User(AbstractUser):
	class Role(models.TextChoices):
		ADMIN = 'admin', 'Admin'
		CASHIER = 'cashier', 'Cashier'

	role = models.CharField(max_length=20, choices=Role.choices, default=Role.CASHIER)

	def __str__(self):
		return f"{self.username} ({self.role})"


class Passenger(models.Model):
	class DiscountType(models.TextChoices):
		REGULAR = 'regular', 'Regular'
		STUDENT = 'student', 'Student'
		SENIOR = 'senior', 'Senior'
		PWD = 'pwd', 'PWD'

	full_name = models.CharField(max_length=255)
	contact_number = models.CharField(max_length=30, blank=True, null=True)
	discount_type = models.CharField(
		max_length=20,
		choices=DiscountType.choices,
		default=DiscountType.REGULAR,
	)
	date_registered = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return self.full_name


class Route(models.Model):
	destination_name = models.CharField(max_length=255)
	base_fare = models.DecimalField(max_digits=10, decimal_places=2)
	discount_exempt = models.BooleanField(default=False)
	is_active = models.BooleanField(default=True)

	@property
	def discount_fare(self):
		if self.discount_exempt:
			return self.base_fare
		return self.base_fare - Decimal('5.00')

	def __str__(self):
		return self.destination_name


class Card(models.Model):
	class Status(models.TextChoices):
		ACTIVE = 'active', 'Active'
		LOST = 'lost', 'Lost'
		DEACTIVATED = 'deactivated', 'Deactivated'

	uid = models.CharField(max_length=100, unique=True)
	passenger = models.ForeignKey(
		Passenger,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name='cards',
	)
	balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
	date_issued = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return f"{self.uid} - {self.status}"


class Vehicle(models.Model):
	plate_number = models.CharField(max_length=20, unique=True)
	route_name = models.CharField(max_length=255)
	is_active = models.BooleanField(default=True)

	def __str__(self):
		return f"{self.plate_number} ({self.route_name})"


class Trip(models.Model):
	class Status(models.TextChoices):
		ONGOING = 'ongoing', 'Ongoing'
		COMPLETED = 'completed', 'Completed'

	vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='trips')
	date = models.DateField()
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.ONGOING)
	start_time = models.TimeField()
	end_time = models.TimeField(null=True, blank=True)

	def __str__(self):
		return f"{self.vehicle.plate_number} - {self.date} ({self.status})"


class DailyRemittance(models.Model):
	terminal_name = models.CharField(max_length=255)
	cashier = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='daily_remittances',
	)
	dispatcher_name = models.CharField(max_length=255)
	date = models.DateField()
	driver_name = models.CharField(max_length=255)
	vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='daily_remittances')
	terminal_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	ps_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	water_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	dispatcher_collection_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	ftb = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	savings = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	trust_fund = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

	@property
	def gross(self):
		return DispatchRound.objects.filter(remittance=self).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

	@property
	def subtotal(self):
		return self.gross - self.terminal_fee

	def __str__(self):
		return f"{self.date} - {self.driver_name} ({self.vehicle.plate_number})"


class DispatchRound(models.Model):
	remittance = models.ForeignKey(
		DailyRemittance,
		on_delete=models.PROTECT,
		related_name='rounds',
	)
	round_number = models.PositiveSmallIntegerField(
		validators=[MinValueValidator(1), MaxValueValidator(5)]
	)
	amount = models.DecimalField(max_digits=12, decimal_places=2)
	departure_time = models.TimeField()

	class Meta:
		constraints = [
			models.UniqueConstraint(
				fields=['remittance', 'round_number'],
				name='unique_round_number_per_remittance',
			)
		]

	def __str__(self):
		return f"{self.remittance.driver_name} - Round {self.round_number}"


class ManifestTrip(models.Model):
	vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name='manifest_trips')
	trip = models.ForeignKey(
		Trip,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name='manifest_trips',
	)
	date = models.DateField()
	departure_time = models.TimeField(null=True, blank=True)
	is_finalized = models.BooleanField(default=False)
	finalized_at = models.DateTimeField(null=True, blank=True)
	cashier = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='manifest_trips',
	)

	def __str__(self):
		return f"{self.date} - {self.vehicle.plate_number} ({self.departure_time})"


class FareManifestEntry(models.Model):
	class Source(models.TextChoices):
		RFID = 'rfid', 'RFID'
		MANUAL = 'manual', 'Manual'

	manifest_trip = models.ForeignKey(
		ManifestTrip,
		on_delete=models.PROTECT,
		related_name='entries',
	)
	route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name='manifest_entries')
	passenger_count = models.PositiveIntegerField()
	discount_count = models.PositiveIntegerField(default=0)
	total_fare = models.DecimalField(max_digits=12, decimal_places=2)
	source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)

	class Meta:
		constraints = [
			models.CheckConstraint(
				condition=Q(discount_count__lte=F('passenger_count')),
				name='discount_count_lte_passenger_count',
			),
			models.UniqueConstraint(
				fields=['manifest_trip', 'route'],
				name='unique_route_per_manifest_trip',
			),
		]

	def __str__(self):
		return f"{self.manifest_trip} - {self.route.destination_name}"


class Transaction(models.Model):
	class TransactionType(models.TextChoices):
		TOPUP = 'topup', 'Top-up'
		FARE = 'fare', 'Fare'

	card = models.ForeignKey(Card, on_delete=models.PROTECT, related_name='transactions')
	cashier = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		null=True,
		blank=True,
		related_name='transactions',
	)
	transaction_type = models.CharField(max_length=20, choices=TransactionType.choices)
	amount = models.DecimalField(max_digits=12, decimal_places=2)
	trip = models.ForeignKey(
		Trip,
		on_delete=models.PROTECT,
		null=True,
		blank=True,
		related_name='transactions',
	)
	route = models.ForeignKey(
		Route,
		on_delete=models.PROTECT,
		null=True,
		blank=True,
		related_name='transactions',
	)
	balance_after = models.DecimalField(max_digits=12, decimal_places=2)
	timestamp = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return f"{self.card.uid} - {self.transaction_type} {self.amount}"
